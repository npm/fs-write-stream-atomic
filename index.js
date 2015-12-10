var fs = require('graceful-fs')
var PassThrough = require('readable-stream').PassThrough
var util = require('util')
var MurmurHash3 = require('imurmurhash')
var iferr = require('iferr')

function murmurhex () {
  var hash = MurmurHash3('')
  for (var ii = 0; ii < arguments.length; ++ii) {
    hash.hash(hash + arguments[ii])
  }
  return hash.result()
}

var invocations = 0
function getTmpname (filename) {
  return filename + '.' + murmurhex(__filename, process.pid, ++invocations)
}

module.exports = WriteStreamAtomic

util.inherits(WriteStreamAtomic, PassThrough)

function WriteStreamAtomic (path, options) {
  if (!options) options = {}

  if (!(this instanceof WriteStreamAtomic)) {
    return new WriteStreamAtomic(path, options)
  }

  this.__atomicTarget = path
  this.__atomicChown = options.chown
  this.__atomicTmp = getTmpname(path)
  this.__atomicFinished = false
  this.__atomicMoved = false
  this.__atomicStream = fs.WriteStream(this.__atomicTmp, options)
  this.__atomicStream.on('error', handleError.bind(this))

  PassThrough.call(this, options)
  this.pipe(this.__atomicStream)
}

function cleanupSync () {
  try {
    fs.unlinkSync(this.__atomicTmp)
  } finally {
    return
  }
}

function handleError (er) {
  cleanupSync()
  this.emit('error', er)
}

function finish () {
  if (!this.__atomicFinished) return
  if (!this.__atomicMoved) return
  PassThrough.prototype.emit.call(this, 'finish')
  process.nextTick(function () {
    this.emit('close')
  }.bind(this))
}

WriteStreamAtomic.prototype.emit = function (event) {
  // We'll emit this ourselves, as we need to hold off on emitting it
  // until after we've completed putting the final file into place.
  // To do otherwise creats a race between finish and close ;_;
  if (event === 'finish') {
    this.__atomicFinished = true
    return finish.call(this)
  }
  return PassThrough.prototype.emit.apply(this, arguments)
}

WriteStreamAtomic.prototype._flush = function (cb) {
  var writeStream = this
  if (writeStream.__atomicChown) {
    var uid = writeStream.__atomicChown.uid
    var gid = writeStream.__atomicChown.gid
    return fs.chown(writeStream.__atomicTmp, uid, gid, iferr(cleanup, moveIntoPlace))
  } else {
    moveIntoPlace()
  }
  function cleanup (err) {
    if (!err) return cb()
    fs.unlink(writeStream.__atomicTmp, function () {
      writeStream.emit('error', err)
      cb()
    })
  }
  function moveIntoPlace () {
    fs.rename(writeStream.__atomicTmp, writeStream.__atomicTarget, function (err) {
      cleanup(err)
      writeStream.__atomicMoved = true
      finish.call(writeStream)
    })
  }
}
