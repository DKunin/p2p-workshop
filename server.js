'use strict'

var fs = require('fs')
var net = require('net')
var DC = require('discovery-channel')
var msgpack = require('msgpack5-stream')
var fsChunkStore = require('fs-chunk-store')
var hasher = require('fixed-size-chunk-hashing')
var crypto = require('crypto')
var pump = require('pump')

var filename = process.argv[2]

if (!filename) {
  console.log('Usage: node server.js [filename]')
  process.exit(1)
}

var CHUNK_SIZE = 1024 // Arbitrary chunk size that fits in memory (not too big, not too small)
var FILE_LENGTH = fs.statSync(filename).size
var file = fsChunkStore(CHUNK_SIZE, {path: filename, length: FILE_LENGTH})
var channel = DC({dht: false}) // set true to work over the internet

pump(fs.createReadStream(filename), hasher(CHUNK_SIZE, function (err, hashes) {
  if (err) throw err

  console.log(hashes)

  var id = crypto.createHash('sha256')
    .update(hashes.join('\n'))
    .digest()
    .toString('hex')

  var server = net.createServer(function (socket) {
    console.log('New peer connected: %s:%s', socket.remoteAddress, socket.remotePort)

    // Wrap our TCP socket with a msgpack5 protocol wrapper
    var protocol = msgpack(socket)

    protocol.on('error', console.log)

    protocol.on('data', function (msg) {
      switch (msg.type) {
        case 'file':
          protocol.write({ type: 'hashes', size: FILE_LENGTH, hashes, chunkSize: CHUNK_SIZE })
          break
        case 'request':
          if (msg.index === undefined) {
            console.log('no index')
            protocol.destroy()
            return
          }

          file.get(msg.index, function (err, data) {
            if (err) {
              protocol.destroy(err)
              return
            }
            protocol.write({
              type: 'response',
              index: msg.index,
              data
            })
          })
          return
        default:
          protocol.destroy(new Error('unkown type'))
          return
      }
    })
  })

  server.listen(function () {
    channel.join(id, server.address().port)
    console.log('Sharing %s as %s', filename, id)
  })
}))
