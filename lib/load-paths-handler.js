/* global emit */

const async = require('async')
const path = require('path')
const {Minimatch} = require('minimatch')
const {PathScanner} = require('scandal')

const PathsChunkSize = 100

const emittedPaths = new Set()

class PathLoader {
  constructor (rootPath, ignoreVcsIgnores, traverseSymlinkDirectories, ignoredNames) {
    this.rootPath = rootPath
    this.traverseSymlinkDirectories = traverseSymlinkDirectories
    this.ignoredNames = ignoredNames
    this.paths = []
    this.ignoreVcsIgnores = ignoreVcsIgnores
  }

  load (done) {
    let start = new Date()

    console.log('Load start')
    this.loadPath(this.rootPath, true, () => {
      this.flushPaths()
      console.log('Load end', new Date() - start, 'Paths: ', emittedPaths.size)
      done()
    })
  }

  isIgnored (loadedPath) {
    const relativePath = path.relative(this.rootPath, loadedPath)
    for (let ignoredName of this.ignoredNames) {
      if (ignoredName.match(relativePath)) return true
    }
  }

  pathLoaded (loadedPath, done) {
    if (!this.isIgnored(loadedPath) && !emittedPaths.has(loadedPath)) {
      this.paths.push(loadedPath)
      emittedPaths.add(loadedPath)
    }

    if (this.paths.length === PathsChunkSize) {
      this.flushPaths()
    }
  }

  flushPaths () {
    emit('load-paths:paths-found', this.paths)
    this.paths = []
  }

  loadPath (pathToLoad, root, done) {
    if (this.isIgnored(pathToLoad) && !root) return done()

    let scanner = new PathScanner(pathToLoad, {
      excludeVcsIgnores: this.ignoreVcsIgnores,
      follow: this.traverseSymlinkDirectories,
      includeHidden: true,
      exclusions: this.ignoredNames.map((prop) => prop.pattern)
    })

    scanner.on('path-found', (path) => {
      this.pathLoaded(path, done)
    })
    scanner.on('finished-scanning', (path) => {
      console.log('Done!', path)
      done()
    })

    scanner.scan()
  }
}

module.exports = function (rootPaths, followSymlinks, ignoreVcsIgnores, ignores = []) {
  const ignoredNames = []
  for (let ignore of ignores) {
    if (ignore) {
      try {
        ignoredNames.push(new Minimatch(ignore, {matchBase: true, dot: true}))
      } catch (error) {
        console.warn(`Error parsing ignore pattern (${ignore}): ${error.message}`)
      }
    }
  }

  async.each(
    rootPaths,
    (rootPath, next) =>
      new PathLoader(
        rootPath,
        ignoreVcsIgnores,
        followSymlinks,
        ignoredNames
      ).load(next)
    ,
    this.async()
  )
}
