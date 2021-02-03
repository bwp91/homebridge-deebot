/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = {
  defaultConfig: {
    name: 'Deebot',
    countryCode: '',
    username: '',
    password: '',
    refreshTime: 120,
    disableDeviceLogging: false,
    debug: false,
    disablePlugin: false,
    motionDuration: 30,
    lowBattThreshold: 15,
    showMotionLowBatt: false,
    showBattHumidity: false,
    ignoredDevices: [],
    platform: 'Deebot'
  },

  defaultValues: {
    refreshTime: 120,
    motionDuration: 30,
    lowBattThreshold: 15
  },

  minValues: {
    refreshTime: 30,
    motionDuration: 1,
    lowBattThreshold: 1
  },

  messages: {
    cfgItem: 'Config entry',
    cfgLow: 'is set too low so increasing to',
    cfgRmv: 'is unused and can be removed',
    chargeFail: 'sending charge update failed as',
    cleanFail: 'sending clean update failed as',
    cleaning: 'cleaning',
    complete: '✓ Setup complete',
    curBatt: 'current battery',
    curCleaning: 'current cleaning state',
    curCharging: 'current charging state',
    devAdd: 'has been added to Homebridge',
    devInit: 'initialised with id',
    devNotAdd: 'could not be added to Homebridge as',
    devNotConf: 'could not be configured as',
    devNotInit: 'could not be initialised as',
    devNotRefreshed: 'could not be refreshed as',
    devNotRemove: 'could not be removed from Homebridge as',
    devRemove: 'has been removed from Homebridge',
    disabled: 'To change this, set disablePlugin to false',
    disabling: 'Disabling plugin',
    identify: 'identify button pressed',
    inBattFail: 'receiving battery update failed as',
    inChgFail: 'receiving charge update failed as',
    inClnFail: 'receiving clean update failed as',
    inErrFail: 'receiving error update failed as',
    initialised: 'initialised. Syncing with ECOVACS',
    inMsgFail: 'receiving message update failed as',
    inRdyFail: 'receiving ready update failed as',
    invalidCCode: 'Invalid ECOVACS country code',
    lowBattMsg: 'Device has low battery - ',
    missingCreds: 'ECOVACS credentials missing from config',
    returning: 'returning',
    sendingCommand: 'sending command',
    sentMsg: 'sent message',
    sentErr: 'sent error',
    stop: 'stop'
  },

  welcomeMessages: [
    "Don't forget to ☆ this plugin on GitHub if you're finding it useful!",
    'Have a feature request? Visit http://bit.ly/hb-deebot-issues to ask!',
    'Interested in sponsoring this plugin? https://github.com/sponsors/bwp91',
    "Join the plugin's Discord community! https://discord.gg/cMGhNtZ3tW",
    'Thanks for using this plugin, I hope you find it helpful!',
    'This plugin has been made with ♥ by bwp91 from the UK!'
  ],

  validCCodes: [
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR',
    'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE',
    'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ',
    'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD',
    'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR',
    'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
    'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI',
    'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
    'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS',
    'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
    'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
    'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
    'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK',
    'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME',
    'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ',
    'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
    'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU',
    'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
    'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS',
    'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI',
    'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV',
    'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK',
    'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA',
    'UG', 'UK', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG',
    'VI', 'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM',
    'ZW', 'WW'
  ],

  messagesToIgnore: [
    'NoError: Robot is operational'
  ]
}
