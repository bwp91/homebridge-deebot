var Service, Characteristic, Accessory, UUIDGen;

var DeebotEcovacsAPI = require('./deebotEcovacsAPI.js').DeebotEcovacsAPI;

checkTimer = function (timer) {
  if (timer && timer > 0 && (timer < 30 || timer > 600)) return 300;
  else return timer;
};

function myDeebotEcovacslatform(log, config, api) {
  if (!config) {
    log('No configuration found for homebridge-deebotEcovacs');
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
          platform.api.unregisterPlatformAccessories(
            'homebridge-deebotEcovacs',
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
    'homebridge-deebotEcovacs',
    'HomebridgeDeebotEcovacs',
    myDeebotEcovacslatform,
    true
  );
};

myDeebotEcovacslatform.prototype = {
  configureAccessory: function (accessory) {
    this.log.debug(
      accessory.displayName,
      'Got cached Accessory ' + accessory.UUID + ' for ' + this.name
    );

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
    this.deebotEcovacsAPI.on('deebotsDiscovered', (deebots) => {
      this.knownDeebotsArray = deebots;
    });

    this.deebotEcovacsAPI.authenticate((error) => {
      if (error) {
        this.log.debug('ERROR - authenticating - ' + error);
        callback(undefined);
      } else {
        this.log('INFO - starting deebots discovery');

        this.discoverInProgress = true;
        this.knownDeebotsArray = undefined;
        this.deebotEcovacsAPI.getDeebots();

        setTimeout(() => {
          this.discoverInProgress = false;
          this.log('INFO - stopping deebots discovery, deebots found : ' + this.knownDeebotsArray);
          this.loadDeebots();
        }, 10000);
      }
    });
  },

  loadDeebots: function () {
    if (this.knownDeebotsArray) {
      for (let s = 0; s < this.knownDeebotsArray.length; s++) {
        var vacBot = this.knownDeebotsArray[s];
        this.log.debug('INFO - Setting up Deebot : ' + JSON.stringify(vacBot.vacuum));

        let deebotName = vacBot.vacuum.nick;

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
            'homebridge-deebotEcovacs',
            'HomebridgeDeebotEcovacs',
            [myDeebotEcovacsAccessory]
          );
          this.foundAccessories.push(myDeebotEcovacsAccessory);
        }

        myDeebotEcovacsAccessory.platform = this;
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

        this.bindCharacteristicEvents(
          Characteristic.BatteryLevel,
          HKBatteryService,
          myDeebotEcovacsAccessory
        );
        this.bindCharacteristicEvents(
          Characteristic.ChargingState,
          HKBatteryService,
          myDeebotEcovacsAccessory
        );
        this.bindCharacteristicEvents(
          Characteristic.StatusLowBattery,
          HKBatteryService,
          myDeebotEcovacsAccessory
        );

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

        this.bindCharacteristicEvents(Characteristic.On, HKFanService, myDeebotEcovacsAccessory);

        if (!vacBot.is_ready) {
          vacBot.connect_and_wait_until_ready();
        }

        vacBot.on('ready', (event) => {
          this.log.debug('Vacbot ready');
          vacBot.run('cleanstate');
          vacBot.run('batterystate');
          vacBot.run('chargestate');
        });

        vacBot.on('BatteryInfo', (battery) => {
          this.log.debug('Battery level: %d%', Math.round(battery.power));
          let batteryLevel = Math.round(battery.power);
          if (batteryLevel > 100) batteryLevel = 100;
          else if (batteryLevel < 0) batteryLevel = 0;

          HKBatteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(batteryLevel);
        });

        vacBot.on('ChargeState', (charge_status) => {
          this.log.debug('Charge status: %s', charge_status);

          HKBatteryService.getCharacteristic(Characteristic.ChargingState).updateValue(
            charge_status.type == 'SlotCharging'
          );
        });

        vacBot.on('CleanReport', (clean_status) => {
          this.log.debug('Clean status: %s', clean_status);
        });

        vacBot.on('PushRobotNotify', (values) => {
          this.log.debug("Notification '%s': %s", values.type, values.act);
        });
      }

      //timer for background refresh
      this.refreshBackground();
    } else {
      this.log('WARNING  : no deebot found');
    }
  },

  getBatteryLevel(homebridgeAccessory, result) {
    var percent = 0;
    if (result && result instanceof Array && result.length > 0) {
      for (let s = 0; s < result.length; s++) {
        if (result[s].id === homebridgeAccessory.deebotID) {
          percent = result[s].status.batteryPercent;
          break;
        }
      }
    }
    return percent;
  },

  getBatteryLevelCharacteristic: function (homebridgeAccessory, callback) {
    this.log.debug('INFO - getBatteryLevelCharacteristic');
    var percent = 0;

    callback(undefined, percent);
  },

  getChargingStateCharacteristic: function (homebridgeAccessory, callback) {
    this.log.debug('INFO - getChargingStateCharacteristic');
    var charging = 0;
    callback(undefined, charging);
  },

  getLowBatteryCharacteristic: function (homebridgeAccessory, callback) {
    this.log.debug('INFO - getLowBatteryCharacteristic');
    var lowww = 0;

    callback(undefined, lowww);
  },

  getDeebotEcovacsOnCharacteristic: function (homebridgeAccessory, callback) {
    this.log.debug('getDeebotEcovacsOnCharacteristic');

    var cleaning = 0;
    callback(undefined, cleaning);
  },
  setDeebotEcovacsOnCharacteristic: function (
    homebridgeAccessory,
    characteristic,
    value,
    callback
  ) {
    this.log.debug('setDeebotEcovacsOnCharacteristic -' + value);
    callback();
  },

  bindCharacteristicEvents: function (characteristic, service, homebridgeAccessory) {
    if (characteristic instanceof Characteristic.BatteryLevel) {
      characteristic.on(
        'get',
        function (callback) {
          homebridgeAccessory.platform.getBatteryLevelCharacteristic(homebridgeAccessory, callback);
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.ChargingState) {
      characteristic.on(
        'get',
        function (callback) {
          homebridgeAccessory.platform.getChargingStateCharacteristic(
            homebridgeAccessory,
            callback
          );
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.StatusLowBattery) {
      characteristic.on(
        'get',
        function (callback) {
          homebridgeAccessory.platform.getLowBatteryCharacteristic(homebridgeAccessory, callback);
        }.bind(this)
      );
    } else if (
      characteristic instanceof Characteristic.On &&
      service.controlService instanceof Service.Fan
    ) {
      characteristic.on(
        'get',
        function (callback) {
          homebridgeAccessory.platform.getDeebotEcovacsOnCharacteristic(
            homebridgeAccessory,
            callback
          );
        }.bind(this)
      );

      characteristic.on(
        'set',
        function (value, callback) {
          homebridgeAccessory.platform.setDeebotEcovacsOnCharacteristic(
            homebridgeAccessory,
            characteristic,
            value,
            callback
          );
        }.bind(this)
      );
    }
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

  refreshAllDeebots: function () {},
};

/*
vacbot.run("clean", [mode, [speed]]);
vacbot.run("edge");
vacbot.run("spot");
vacbot.run("stop");
vacbot.run("charge");
vacbot.run("move", direction);
vacbot.run("left"); // shortcut for vacbot.run("move", "left")
vacbot.run("right"); // shortcut for vacbot.run("move", "right")
vacbot.run("forward"); // shortcut for vacbot.run("move", "forward")
vacbot.run("turnaround"); // shortcut for vacbot.run("move", "turnaround")
vacbot.run("deviceinfo");
vacbot.run("cleanstate");
vacbot.run("chargestate");
vacbot.run("batterystate");
vacbot.run("lifespan", component);
vacbot.run("settime", timestamp, timezone);
*/
