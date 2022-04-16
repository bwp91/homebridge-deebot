export default {
  defaultConfig: {
    name: 'Deebot',
    countryCode: '',
    username: '',
    password: '',
    debug: false,
    disablePlugin: false,
    disableDeviceLogging: false,
    refreshTime: 120,
    devices: [],
    platform: 'Deebot',
  },

  defaultDevice: {
    hideMotionSensor: false,
    motionDuration: 30,
    lowBattThreshold: 15,
    showMotionLowBatt: false,
    showBattHumidity: false,
    command1: '',
    command2: '',
    command3: '',
    command4: '',
    command5: '',
    command6: '',
    command7: '',
    command8: '',
    command9: '',
    command10: '',
    command11: '',
    command12: '',
    command13: '',
    command14: '',
    command15: '',
    overrideLogging: 'default',
  },

  defaultValues: {
    refreshTime: 120,
    motionDuration: 30,
    lowBattThreshold: 15,
    overrideLogging: 'default',
  },

  minValues: {
    refreshTime: 30,
    motionDuration: 1,
    lowBattThreshold: 1,
  },

  allowed: {
    overrideLogging: ['default', 'standard', 'debug', 'disable'],
  },

  speed2Label: {
    1: 'standard',
    2: 'standard',
    3: 'max',
    4: 'max',
  },
};
