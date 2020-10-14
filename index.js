/* jshint -W014, -W033, esversion: 8 */
'use strict'
module.exports = function (homebridge) {
  const Deebot = require('./lib/deebot.js')(homebridge)
  homebridge.registerPlatform('homebridge-deebot', 'Deebot', Deebot, true)
}
