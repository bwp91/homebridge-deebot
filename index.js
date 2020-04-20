var Service, Characteristic, Accessory, UUIDGen;

var DeebotEcovacsAPI = require('./deebotEcovacsAPI.js').DeebotEcovacsAPI;

checkTimer = function (timer) {
  if (timer && timer > 0 && (timer < 30 || timer > 600)) return 300;
  else return timer;
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

  this.foundAccessories = [];
  this.deebotEcovacsAPI = new DeebotEcovacsAPI(log, this);

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
            'HomebridgeDeebotEcovacs',
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
    'HomebridgeDeebotEcovacs',
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

    //TODO logout / clear listeners ...
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
        this.log('INFO - Setting up Deebot : ' + JSON.stringify(vacBot.vacuum.nick));

        let deebotName = vacBot.vacuum.nick ? vacBot.vacuum.nick : vacBot.vacuum.name;

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
          this.api.registerPlatformAccessories(
            'homebridge-deebotecovacs',
            'HomebridgeDeebotEcovacs',
            [myDeebotEcovacsAccessory]
          );
          this.foundAccessories.push(myDeebotEcovacsAccessory);
        }

        myDeebotEcovacsAccessory.vacBot = vacBot;

        let HKBatteryService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(
          deebotName,
          'BatteryService' + deebotName
        );

        if (!HKBatteryService) {
          this.log('INFO - Creating  Battery Service ' + deebotName + '/' + deebotName);
          HKBatteryService = new Service.BatteryService(deebotName, 'BatteryService' + deebotName);
          HKBatteryService.subtype = 'BatteryService' + deebotName;
          myDeebotEcovacsAccessory.addService(HKBatteryService);
        }

        this.bindBatteryLevelCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);
        this.bindChargingStateCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);
        this.bindStatusLowBatteryCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);

        let HKFanService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(
          deebotName,
          'FanService' + deebotName
        );

        if (!HKFanService) {
          this.log('INFO - Creating  Fan Service ' + deebotName + '/' + deebotName);
          HKFanService = new Service.Fan(deebotName, 'FanService' + deebotName);
          HKFanService.subtype = 'FanService' + deebotName;
          myDeebotEcovacsAccessory.addService(HKFanService);
        }

        this.bindOnCharacteristic(myDeebotEcovacsAccessory, HKFanService);
        this.bindRotationDirectionCharacteristic(myDeebotEcovacsAccessory, HKFanService);
        this.bindRotationSpeedCharacteristic(myDeebotEcovacsAccessory, HKFanService);

        //initial refresh.
        vacBot.on('ready', (event) => {
          this.log.debug('INFO - Vacbot ready: ' + JSON.stringify(event));

          vacBot.run('GetBatteryState');
          vacBot.run('GetChargeState');
          vacBot.run('GetCleanState');
          vacBot.run('GetCleanSpeed');

          if (vacBot.orderToSend && vacBot.orderToSend !== undefined) {
            this.log('INFO - sendingCommand ' + vacBot.orderToSend);

            if (vacBot.orderToSend instanceof Array) {
              vacBot.run.apply(vacBot, orderToSend);
            } else {
              vacBot.run(vacBot.orderToSend);
            }

            vacBot.orderToSend = undefined;
          }
        });

        vacBot.on('BatteryInfo', (battery) => {
          this.log.debug('INFO - Battery level: %d%', battery);
          let batteryLevel = this.getBatteryLevel(battery);

          let currentValue = HKBatteryService.getCharacteristic(Characteristic.BatteryLevel).value;

          if (currentValue !== batteryLevel) {
            HKBatteryService.setCharacteristic(Characteristic.BatteryLevel, batteryLevel);
            if (batteryLevel < 20)
              HKBatteryService.setCharacteristic(Characteristic.StatusLowBattery, 1);
            else HKBatteryService.setCharacteristic(Characteristic.StatusLowBattery, 0);
          }
        });

        vacBot.on('ChargeState', (charge_status) => {
          this.log.debug('INFO - Charge status: %s', charge_status);
          let charging = charge_status == 'charging';
          let currentValue = HKBatteryService.getCharacteristic(Characteristic.ChargingState).value;

          if (currentValue !== charging) {
            HKBatteryService.setCharacteristic(Characteristic.ChargingState, charging);
          }

          let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;
          if (charging && currentOnValue) {
            HKFanService.getCharacteristic(Characteristic.On).updateValue(false);
          }
        });

        vacBot.on('CleanReport', (clean_status) => {
          this.log.debug('INFO - Clean status: %s', clean_status);

          let cleaning = clean_status != 'stop' && clean_status != 'pause';
          let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;

          if (currentOnValue !== cleaning) {
            HKFanService.getCharacteristic(Characteristic.On).updateValue(cleaning);
          }
        });

        vacBot.on('CleanSpeed', (clean_speed) => {
          let currentSpeedValue = HKFanService.getCharacteristic(Characteristic.RotationSpeed)
            .value;
          let deebotSpeed = this.getCleanSpeed(currentSpeedValue);

          this.log.debug('INFO - Clean speed : %s - %s', clean_speed, deebotSpeed);

          if (deebotSpeed !== clean_speed) {
            let newSpeed = this.getFanSpeed(clean_speed);
            HKFanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(newSpeed);
          }
        });

        if (!vacBot.is_ready) vacBot.connect_and_wait_until_ready();
      }

      //timer for background refresh
      this.refreshBackground();
    } else {
      this.log('WARNING - no deebot found');
    }
  },

  getBatteryLevel(battery) {
    let batteryLevel = Math.round(battery * 100);
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

    //TODO : check vacbot and if ok return else return current
    var percent = service.getCharacteristic(Characteristic.BatteryLevel).value;
    callback(undefined, percent);

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run('GetBatteryState');
    } else {
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }
  },

  getChargingStateCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getChargingStateCharacteristic ');

    //TODO : check vacbot and if ok return else return current
    var charging = service.getCharacteristic(Characteristic.ChargingState).value;
    callback(undefined, charging);

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run('GetChargeState');
    } else {
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }
  },

  getLowBatteryCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getLowBatteryCharacteristic ');

    //TODO : check vacbot and if ok return else return current

    var lowww = service.getCharacteristic(Characteristic.StatusLowBattery).value;
    callback(undefined, lowww);

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run('GetBatteryState');
    } else {
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }
  },

  getDeebotEcovacsOnCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getDeebotEcovacsOnCharacteristic');

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run('GetChargeState');
      homebridgeAccessory.vacBot.run('GetCleanState');
    } else {
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }

    //TODO : check vacbot and if ok return else return current
    var cleaning = service.getCharacteristic(Characteristic.On).value;

    callback(undefined, cleaning);
  },
  setDeebotEcovacsOnCharacteristic: function (homebridgeAccessory, value, callback) {
    this.log.debug('INFO - setDeebotEcovacsOnCharacteristic -' + value);
    callback();

    let orderToSend = value ? 'Clean' : 'Charge';

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run(orderToSend);
    } else {
      homebridgeAccessory.vacBot.orderToSend = orderToSend;
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }
  },

  getDeebotEcovacsModeCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getDeebotEcovacsModeCharacteristic');

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run('GetCleanState');
    } else {
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }

    //TODO : check vacbot and if ok return else return current
    var mode = service.getCharacteristic(Characteristic.RotationDirection).value;

    callback(undefined, mode);
  },

  setDeebotEcovacsModeCharacteristic: function (homebridgeAccessory, value, callback) {
    this.log.debug('INFO - setDeebotEcovacsModeCharacteristic -' + value);
    callback();

    // TODO check if it is cleaning. If yes, stop, then change mode.
    // else start with correct mode.
  },

  getDeebotEcovacsSpeedCharacteristic: function (homebridgeAccessory, service, callback) {
    this.log.debug('INFO - getDeebotEcovacsSpeedCharacteristic');

    if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
      homebridgeAccessory.vacBot.run('GetCleanSpeed');
    } else {
      homebridgeAccessory.vacBot.connect_and_wait_until_ready();
    }

    //TODO : check vacbot and if ok return else return current
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
          this.setDeebotEcovacsOnCharacteristic(homebridgeAccessory, value, callback);
        }.bind(this)
      );
  },

  bindRotationDirectionCharacteristic(homebridgeAccessory, service) {
    service
      .getCharacteristic(Characteristic.RotationDirection)
      .on(
        'get',
        function (callback) {
          this.getDeebotEcovacsModeCharacteristic(homebridgeAccessory, service, callback);
        }.bind(this)
      )
      .on(
        'set',
        function (value, callback) {
          this.setDeebotEcovacsModeCharacteristic(homebridgeAccessory, value, callback);
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
      this.log.debug('INFO - refreshing - ' + this.foundAccessories[a].vacBot.vacuum.nick);

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
