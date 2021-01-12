/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = {
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  hasProperty: (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop),
  logMessages: [
    "Don't forget to ☆ this plugin on GitHub if you're finding it useful!"
  ],
  validCCodes: [
    'CN', 'TW', 'MY', 'JP', 'SG',
    'TH', 'HK', 'IN', 'KR', 'US',
    'FR', 'ES', 'UK', 'NO', 'CH',
    'MX', 'DE', 'PT', 'AU', 'IT',
    'NL', 'SE', 'BE', 'DK', 'WW'
  ],
  defaults: {
    refreshTime: 120,
    lowBattThreshold: 20,
    motionDuration: 30
  },
  messagesToIgnore: [
    'NoError: Robot is operational'
  ]
}
