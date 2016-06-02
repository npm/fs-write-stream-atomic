'use strict'
var fs = require('graceful-fs')
var path = require('path')
var test = require('tap').test
var rimraf = require('rimraf')
var writeStream = require('../index.js')

var target = path.resolve(__dirname, 'test-rename-eperm')

test('rename eperm', function (t) {
  t.plan(2)

  var _rename = fs.rename
  fs.existsSync = function (src) {
    return true
  }
  fs.rename = function (src, dest, cb) {
    // simulate a failure during rename where the file
    // is renamed successfully but the process encounters
    // an EPERM error
    _rename(src, dest, function (e) {
      var err = new Error('TEST BREAK')
      err.syscall = 'rename'
      err.code = 'EPERM'
      cb(err)
    })
  }

  var stream = writeStream(target, { isWin: true })
  var hadError = false
  var calledFinish = false
  stream.on('error', function (er) {
    hadError = true
    console.log('#', er)
  })
  stream.on('finish', function () {
    calledFinish = true
  })
  stream.on('close', function () {
    t.is(hadError, false, 'error was caught')
    t.is(calledFinish, true, 'finish was called before close')
  })
  stream.end()
})

test('cleanup', function (t) {
  rimraf.sync(target)
  t.end()
})
