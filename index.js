var Service, Characteristic, Accessory, UUIDGen;

var DeebotEcovacsAPI = require('./deebotEcovacsAPI.js').DeebotEcovacsAPI;

checkTimer = function (timer) {
  if (timer && timer > 0 && (timer < 30 || timer > 600)) return 300;
  else return timer;
};

checkParameter = function (parameter, def) {
  if (parameter == undefined) {
    return def;
  } else {
    if (typeof parameter === 'string') {
      switch (parameter.toLowerCase().trim()) {
        case 'true':
        case 'yes':
          return true;
        case 'false':
        case 'no':
        case null:
          return false;
        case 'undefined':
        default:
          return parameter;
      }
    } else {
      return parameter;
    }
  }
};

function myDeebotEcovacsPlatform(log, config, api) {
  if (!config) {
    log('No configuration found for homebridge-deebotecovacs');
    return;
  }

  this.api = api;
  this.log = log;
  this.login = config['email'];
  this.password = config['password'];
  this.countryCode = config['countryCode'];
  this.refreshTimer = checkTimer(config['refreshTimer']);
  this.cleanCache = config['cleanCache'];

  this.publishBipSwitch = checkParameter(config['publishBipSwitch'], true);
  this.publishSwitch = checkParameter(config['publishSwitch'], true);
  this.publishFan = checkParameter(config['publishFan'], true);
  this.publishMotionDetector = checkParameter(config['publishMotionDetector'], true);
  this.leftDirectionCleaningMode = checkParameter(config['leftDirectionCleaningMode'], 'edge');
  this.rightDirectionCleaningMode = checkParameter(config['rightDirectionCleaningMode'], 'auto');

  this.foundAccessories = [];
  this.deebotEcovacsAPI = new DeebotEcovacsAPI(log, this);

  this._confirmedAccessories = [];
  this._confirmedServices = [];

  this.api
    .on(
      'shutdown',
      function () {
        this.end();
      }.bind(this)
    )
    .on(
      'didFinishLaunching',
      function () {
        this.log('DidFinishLaunching');

        if (this.cleanCache) {
          this.log('WARNING - Removing Accessories');
          this.api.unregisterPlatformAccessories(
            'homebridge-deebotecovacs',
            'DeebotEcovacs',
            this.foundAccessories
          );
          this.foundAccessories = [];
        }
        this.discoverDeebots();
      }.bind(this)
    );
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Accessory = homebridge.platformAccessory;
  UUIDGen = homebridge.hap.uuid;
  HomebridgeAPI = homebridge;
  homebridge.registerPlatform(
    'homebridge-deebotecovacs',
    'DeebotEcovacs',
    myDeebotEcovacsPlatform,
    true
  );
};

myDeebotEcovacsPlatform.prototype = {
  configureAccessory: function (accessory) {
    this.log.debug(accessory.displayName, 'Got cached Accessory ' + accessory.UUID);

    this.foundAccessories.push(accessory);
  },

  end() {
    this.log('INFO - shutdown');
    if (this.timerID) {
      clearInterval(this.timerID);
      this.timerID = undefined;
    }

    // disconnecting
    for (let a = 0; a < this.foundAccessories.length; a++) {
      this.log.debug('INFO - shutting down - ' + this.foundAccessories[a].displayName);

      if (this.foundAccessories[a].vacBot && this.foundAccessories[a].vacBot.is_ready) {
        this.foundAccessories[a].vacBot.disconnect;
      }
    }
  },

  //Cleaning methods
  cleanPlatform: function () {
    this.cleanAccessories();
    this.cleanServices();
  },

  cleanAccessories: function () {
    //cleaning accessories
    let accstoRemove = [];
    for (let acc of this.foundAccessories) {
      if (!this._confirmedAccessories.find((x) => x.UUID == acc.UUID)) {
        accstoRemove.push(acc);
        this.log('WARNING - Accessory will be Removed ' + acc.UUID + '/' + acc.displayName);
      }
    }

    if (accstoRemove.length > 0)
      this.api.unregisterPlatformAccessories(
        'homebridge-deebotecovacs',
        'DeebotEcovacs',
        accstoRemove
      );
  },

  cleanServices: function () {
    //cleaning services
    for (let acc of this.foundAccessories) {
      let servicestoRemove = [];
      for (let serv of acc.services) {
        if (
          serv.subtype !== undefined &&
          !this._confirmedServices.find((x) => x.UUID == serv.UUID && x.subtype == serv.subtype)
        ) {
          servicestoRemove.push(serv);
        }
      }
      for (let servToDel of servicestoRemove) {
        this.log(
          'WARNING - Service Removed' +
            servToDel.UUID +
            '/' +
            servToDel.subtype +
            '/' +
            servToDel.displayName
        );
        acc.removeService(servToDel);
      }
    }
  },

  discoverDeebots: function () {
    //deebot discovered
    this.deebotEcovacsAPI.on('deebotsDiscovered', () => {
      let nbDeebots = 0;
      if (this.deebotEcovacsAPI.vacbots) nbDeebots = this.deebotEcovacsAPI.vacbots.length;
      this.log('INFO - stopping deebots discovery, number of deebots found : ' + nbDeebots);

      if (nbDeebots > 0) this.loadDeebots();
      else {
        this.log('INFO - no deebot found, will retry discovery in 1 minute');
        setTimeout(() => {
          this.deebotEcovacsAPI.getDeebots();
        }, 60000);
      }
    });

    this.deebotEcovacsAPI.on('errorDiscoveringDeebots', () => {
      this.log('ERROR - ERROR while getting deebots, will retry discovery in 1 minute');

      setTimeout(() => {
        this.deebotEcovacsAPI.getDeebots();
      }, 60000);
    });

    this.deebotEcovacsAPI.getDeebots();
  },

  loadDeebots: function () {
    if (this.deebotEcovacsAPI.vacbots) {
      for (let s = 0; s < this.deebotEcovacsAPI.vacbots.length; s++) {
        var vacBot = this.deebotEcovacsAPI.vacbots[s];

        let deebotName = vacBot.vacuum.nick ? vacBot.vacuum.nick : vacBot.vacuum.name;
        this.log('INFO - Discovered Deebot : ' + deebotName);

        let uuid = UUIDGen.generate(deebotName);
        let myDeebotEcovacsAccessory = this.foundAccessories.find((x) => x.UUID == uuid);

        if (!myDeebotEcovacsAccessory) {
          myDeebotEcovacsAccessory = new Accessory(deebotName, uuid);
          myDeebotEcovacsAccessory.name = deebotName;
          myDeebotEcovacsAccessory.manufacturer = vacBot.vacuum.company;
          myDeebotEcovacsAccessory.serialNumber = vacBot.vacuum.did;

          myDeebotEcovacsAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Manufacturer, myDeebotEcovacsAccessory.manufacturer)
            .setCharacteristic(Characteristic.Model, myDeebotEcovacsAccessory.model)
            .setCharacteristic(Characteristic.SerialNumber, myDeebotEcovacsAccessory.serialNumber);
          this.api.registerPlatformAccessories('homebridge-deebotecovacs', 'DeebotEcovacs', [
            myDeebotEcovacsAccessory,
          ]);
          this.foundAccessories.push(myDeebotEcovacsAccessory);
        }

        myDeebotEcovacsAccessory.vacBot = vacBot;
        myDeebotEcovacsAccessory.name = deebotName;

        var HKBatteryService, HKFanService, HKSwitchOnService, HKSwitchBipService, HKMotionService;

        HKBatteryService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(
          deebotName,
          'BatteryService' + deebotName
        );

        if (!HKBatteryService) {
          this.log('INFO - Creating Battery Service ' + deebotName);
          HKBatteryService = new Service.BatteryService(deebotName, 'BatteryService' + deebotName);
          HKBatteryService.subtype = 'BatteryService' + deebotName;
          myDeebotEcovacsAccessory.addService(HKBatteryService);
        }
        this.bindBatteryLevelCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);
        this.bindChargingStateCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);
        this.bindStatusLowBatteryCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);
        this._confirmedServices.push(HKBatteryService);

        if (this.publishFan) {
          HKFanService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(
            'Start/Pause ' + deebotName,
            'FanService' + deebotName
          );

          if (!HKFanService) {
            this.log('INFO - Creating Fan Service ' + deebotName);
            HKFanService = new Service.Fan('Start/Pause ' + deebotName, 'FanService' + deebotName);
            HKFanService.subtype = 'FanService' + deebotName;
            myDeebotEcovacsAccessory.addService(HKFanService);
          }

          HKFanService.type = 'fan';

          this.bindOnCharacteristic(myDeebotEcovacsAccessory, HKFanService);
          this.bindRotationSpeedCharacteristic(myDeebotEcovacsAccessory, HKFanService);
          if (
            this.leftDirectionCleaningMode &&
            this.leftDirectionCleaningMode != '' &&
            this.rightDirectionCleaningMode &&
            this.rightDirectionCleaningMode != ''
          )
            this.bindRotationDirectionCharacteristic(myDeebotEcovacsAccessory, HKFanService);

          HKFanService.setPrimaryService(true);
          this._confirmedServices.push(HKFanService);
        }

        if (this.publishSwitch) {
          HKSwitchOnService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(
            'Start/Stop ' + deebotName,
            'SwitchOnService' + deebotName
          );

          if (!HKSwitchOnService) {
            this.log('INFO - Creating Main Switch Service ' + deebotName);
            HKSwitchOnService = new Service.Switch(
              'Start/Stop ' + deebotName,
              'SwitchOnService' + deebotName
            );
            HKSwitchOnService.subtype = 'SwitchOnService' + deebotName;
            myDeebotEcovacsAccessory.addService(HKSwitchOnService);
          }
          this.bindSwitchOnCharacteristic(myDeebotEcovacsAccessory, HKSwitchOnService);

          HKSwitchOnService.setPrimaryService(true);
          this._confirmedServices.push(HKSwitchOnService);
        }

        if (this.publishBipSwitch) {
          HKSwitchBipService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(
            'Bip ' + deebotName,
            'SwitchBipService' + deebotName
          );

          if (!HKSwitchBipService) {
            this.log('INFO - Creating Sound stateless Switch Service ' + deebotName);
            HKSwitchBipService = new Service.Switch(
              'Bip ' + deebotName,
              'SwitchBipService' + deebotName
            );
            HKSwitchBipService.subtype = 'SwitchBipService' + deebotName;
            myDeebotEcovacsAccessory.addService(HKSwitchBipService);
          }
          this.bindSwitchBipCharacteristic(myDeebotEcovacsAccessory, HKSwitchBipService);
          this._confirmedServices.push(HKSwitchBipService);
        }

        if (this.publishMotionDetector) {
          HKMotionService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(
            deebotName + ' needs attention',
            'MotionService' + deebotName
          );

          if (!HKMotionService) {
            this.log('INFO - Creating Motion Service ' + deebotName);
            HKMotionService = new Service.MotionSensor(
              deebotName + ' needs attention',
              'MotionService' + deebotName
            );
            HKMotionService.subtype = 'MotionService' + deebotName;
            myDeebotEcovacsAccessory.addService(HKMotionService);
          }
          this.bindMotionCharacteristic(HKMotionService);
          this._confirmedServices.push(HKMotionService);
        }

        this.deebotEcovacsAPI.configureEvents(
          vacBot,
          HKBatteryService,
          HKFanService,
          HKSwitchOnService,
          HKMotionService,
          this
        );

        this._confirmedAccessories.push(myDeebotEcovacsAccessory);
      }

      this.cleanPlatform();
      //timer for background refresh
      this.refreshBackground();
    } else {
      this.log('WARNING - no deebot found');
    }
  },

  getBatteryLevel(battery) {
    let batteryLevel = Math.round(battery);
    if (batteryLevel > 100) batteryLevel = 100;
    else if (batteryLevel < 0) batteryLevel = 0;
    return batteryLevel;
  },

  getCleanSpeed(value) {
    let speed = 2;

    if (value <= 25) speed = 1;
    else if (value > 50 && value <= 75) speed = 3;
    else if (value > 75) speed = 4;

    return speed;
  },

  getFanSpeed(value) {
    let speed = 50;

    if (value == 1) speed = 25;
    else if (value == 2) speed = 50;
    else if (value == 3) speed = 75;
    else if (value == 4) speed = 100;

    return speed;
  },

  getBatteryLevelCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getBatteryLevelCharacteristic');

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run('GetBatteryState');
    } else {
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }

    var percent = service.getCharacteristic(Characteristic.BatteryLevel).value;
    callback(undefined, percent);
  },

  getChargingStateCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getChargingStateCharacteristic');

    //don't call GetChargeState since on charac update will handle all
    var charging = service.getCharacteristic(Characteristic.ChargingState).value;
    callback(undefined, charging);
  },

  getLowBatteryCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getLowBatteryCharacteristic ');

    //don't call GetBatteryState since batterylevel charac update will handle all
    var lowww = service.getCharacteristic(Characteristic.StatusLowBattery).value;
    callback(undefined, lowww);
  },

  getDeebotEcovacsOnCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getDeebotEcovacsOnCharacteristic');

    //Delay a bit in order to allow events to be ordered

    setTimeout(() => {
      if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
        homebridgeAccessory.vacBot.run('GetCleanState');
        homebridgeAccessory.vacBot.run('GetChargeState');
      } else {
        homebridgeAccessory.vacBot.connect_and_wait_until_ready();
      }
    }, 1000);

    var cleaning = service.getCharacteristic(Characteristic.On).value;
    callback(undefined, cleaning);
  },

  setDeebotEcovacsOnCharacteristic: function (homebridgeAccessory, service, value, callback) {
    let currentState = service.getCharacteristic(Characteristic.On).value;

    if (value != currentState) {
      let orderToSend = ['Charge'];

      if (service.type == 'fan') orderToSend = ['Stop'];

      if (value == 1) {
        //need to find FAN Service
        let HKFanService = service;
        let currentDirectionValue = 0;
        if (service.type != 'fan')
          HKFanService = homebridgeAccessory.getServiceByUUIDAndSubType(
            'Start/Pause ' + homebridgeAccessory.name,
            'FanService' + homebridgeAccessory.name
          );
        if (HKFanService)
          currentDirectionValue = HKFanService.getCharacteristic(Characteristic.RotationDirection)
            .value;

        orderToSend =
          currentDirectionValue == 1
            ? ['Clean', this.leftDirectionCleaningMode]
            : ['Clean', this.rightDirectionCleaningMode];
      }

      this.log.debug(
        'INFO - setDeebotEcovacsOnCharacteristic -' + value + '-' + currentState + '-' + orderToSend
      );

      if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
        homebridgeAccessory.vacBot.run.apply(homebridgeAccessory.vacBot, orderToSend);
      } else {
        homebridgeAccessory.vacBot.orderToSend = orderToSend;
        homebridgeAccessory.vacBot.connect_and_wait_until_ready();
      }
    }

    callback();
  },

  getDeebotEcovacsModeCharacteristic: function (service, callback) {
    this.log.debug('INFO - getDeebotEcovacsModeCharacteristic');

    //don't call GetCleanState since on charac update will handle all
    var mode = service.getCharacteristic(Characteristic.RotationDirection).value;
    callback(undefined, mode);
  },

  setDeebotEcovacsModeCharacteristic: function (homebridgeAccessory, service, value, callback) {
    let currentDirectionValue = service.getCharacteristic(Characteristic.RotationDirection).value;

    let isOn = service.getCharacteristic(Characteristic.On).value;

    this.log.debug(
      'INFO - setDeebotEcovacsModeCharacteristic -' +
        value +
        '-' +
        currentDirectionValue +
        '-' +
        isOn
    );

    if (currentDirectionValue !== value && isOn) {
      let orderToSend =
        value == 1
          ? ['Clean', this.leftDirectionCleaningMode]
          : ['Clean', this.rightDirectionCleaningMode];

      if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
        homebridgeAccessory.vacBot.run.apply(homebridgeAccessory.vacBot, orderToSend);
      } else {
        homebridgeAccessory.vacBot.orderToSend = orderToSend;
        homebridgeAccessory.vacBot.connect_and_wait_until_ready();
      }
    }

    callback();
  },

  getDeebotEcovacsSpeedCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getDeebotEcovacsSpeedCharacteristic');

    //don't call GetCleanState since on charac update will handle all

    var speed = service.getCharacteristic(Characteristic.RotationSpeed).value;
    callback(undefined, speed);
  },
  setDeebotEcovacsSpeedCharacteristic: function (homebridgeAccessory, service, value, callback) {
    let speed = this.getCleanSpeed(value);
    let currentSpeedValue = service.getCharacteristic(Characteristic.RotationSpeed).value;
    let deebotSpeed = this.getCleanSpeed(currentSpeedValue);
    this.log.debug('INFO - setDeebotEcovacsSpeedCharacteristic -' + speed + '-' + deebotSpeed);

    if (deebotSpeed !== speed) {
      let orderToSend = ['SetCleanSpeed', '' + speed];

      if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
        homebridgeAccessory.vacBot.run.apply(homebridgeAccessory.vacBot, orderToSend);
      } else {
        homebridgeAccessory.vacBot.orderToSend = orderToSend;
        homebridgeAccessory.vacBot.connect_and_wait_until_ready();
      }
    }

    callback();
  },

  setDeebotEcovacsBipCharacteristic: function (homebridgeAccessory, service, value, callback) {
    this.log.debug('INFO - setDeebotEcovacsBipCharacteristic');

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run('playsound');
    } else {
      homebridgeAccessory.vacBot.orderToSend = 'playsound';
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }

    callback();
    // In order to behave like a push button reset the status to off
    setTimeout(() => {
      service.getCharacteristic(Characteristic.On).updateValue(false);
    }, 1000);
  },

  bindBatteryLevelCharacteristic: function (homebridgeAccessory, service) {
    service.getCharacteristic(Characteristic.BatteryLevel).on(
      'get',
      function (callback) {
        this.getBatteryLevelCharacteristic(homebridgeAccessory, service, callback);
      }.bind(this)
    );
  },

  bindChargingStateCharacteristic: function (homebridgeAccessory, service) {
    service.getCharacteristic(Characteristic.ChargingState).on(
      'get',
      function (callback) {
        this.getChargingStateCharacteristic(homebridgeAccessory, service, callback);
      }.bind(this)
    );
  },

  bindStatusLowBatteryCharacteristic: function (homebridgeAccessory, service) {
    service.getCharacteristic(Characteristic.StatusLowBattery).on(
      'get',
      function (callback) {
        this.getLowBatteryCharacteristic(homebridgeAccessory, service, callback);
      }.bind(this)
    );
  },

  bindOnCharacteristic: function (homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.On)
      .on(
        'get',
        function (callback) {
          this.getDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, callback);
        }.bind(this)
      )
      .on(
        'set',
        function (value, callback) {
          this.setDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, value, callback);
        }.bind(this)
      );
  },

  bindRotationDirectionCharacteristic(homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.RotationDirection)
      .on(
        'get',
        function (callback) {
          this.getDeebotEcovacsModeCharacteristic(service, callback);
        }.bind(this)
      )
      .on(
        'set',
        function (value, callback) {
          this.setDeebotEcovacsModeCharacteristic(homebridgeAccessory, service, value, callback);
        }.bind(this)
      );
  },

  bindRotationSpeedCharacteristic(homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.RotationSpeed)
      .on(
        'get',
        function (callback) {
          this.getDeebotEcovacsSpeedCharacteristic(homebridgeAccessory, service, callback);
        }.bind(this)
      )
      .on(
        'set',
        function (value, callback) {
          this.setDeebotEcovacsSpeedCharacteristic(homebridgeAccessory, service, value, callback);
        }.bind(this)
      );
  },

  bindSwitchOnCharacteristic(homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.On)
      .on(
        'get',
        function (callback) {
          this.getDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, callback);
        }.bind(this)
      )
      .on(
        'set',
        function (value, callback) {
          this.setDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, value, callback);
        }.bind(this)
      );
  },

  bindSwitchBipCharacteristic(homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.On)
      .on(
        'get',
        function (callback) {
          callback(false);
        }.bind(this)
      )
      .on(
        'set',
        function (value, callback) {
          this.setDeebotEcovacsBipCharacteristic(homebridgeAccessory, service, value, callback);
        }.bind(this)
      );
  },

  bindMotionCharacteristic(service) {
    service.getCharacteristic(Characteristic.MotionDetected).on(
      'get',
      function (callback) {
        callback(false);
      }.bind(this)
    );
  },

  refreshBackground() {
    //timer for background refresh
    if (this.refreshTimer !== undefined && this.refreshTimer > 0) {
      this.log.debug(
        'INFO - Setting Timer for background refresh every  : ' + this.refreshTimer + 's'
      );
      this.timerID = setInterval(() => this.refreshAllDeebots(), this.refreshTimer * 1000);
    }
  },

  refreshAllDeebots: function () {
    for (let a = 0; a < this.foundAccessories.length; a++) {
      this.log.debug('INFO - refreshing - ' + this.foundAccessories[a].displayName);

      if (this.foundAccessories[a].vacBot && this.foundAccessories[a].vacBot.is_ready) {
        this.foundAccessories[a].vacBot.run('GetBatteryState');
        this.foundAccessories[a].vacBot.run('GetChargeState');
        this.foundAccessories[a].vacBot.run('GetCleanState');
      } else {
        this.foundAccessories[a].vacBot.connect_and_wait_until_ready();
      }
    }
  },
};
