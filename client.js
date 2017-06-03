'use strict'

var fs = require('fs')
var net = require('net')
var DC = require('discovery-channel')
var msgpack = require('msgpack5-stream')

var id = process.argv[2]
var chunk = process.argv[3]

if (!id || !chunk) {
  console.log('Usage: node client.js [id] [chunk]')
  process.exit(1)
}

var channel = DC({dht: false}) // set true to work over the internet
channel.join(id)

channel.once('peer', function (peerId, peer, type) {
  console.log('New peer %s:%s found via %s', peer.host, peer.port, type)

  var socket = net.connect(peer.port, peer.host)

  // Wrap our TCP socket with a msgpack5 protocol wrapper
  var protocol = msgpack(socket)

  protocol.on('data', function (msg) {
    // For now just output the message we got from the server
    console.log(msg)
    protocol.destroy()
    channel.destroy()
  })

  console.log('Fetching chunk %d from %s...', chunk, id)

  protocol.write({
    type: 'request',
    index: chunk
  })
})
