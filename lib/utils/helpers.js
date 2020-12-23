/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = {
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  hasProperty: (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop),
  refreshTime: 120,
  lowBattThreshold: 20,
  motionDuration: 30,
  messagesToIgnore: [
    'NoError: Robot is operational'
  ]
}
