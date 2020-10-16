/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const deebotPlatform = require('./lib/deebot-platform.js')
module.exports = hb => hb.registerPlatform('Deebot', deebotPlatform)
