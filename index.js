'use strict'
module.exports = function (homebridge) {
  const Deebot = require('./lib/deebot.js')(homebridge)
  homebridge.registerPlatform('homebridge-deebot', 'Deebot', Deebot, true)
}
