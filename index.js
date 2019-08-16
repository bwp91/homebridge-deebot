var Service, Characteristic;
var DeebotEcovacsAPI = require('./deebotEcovacsAPI.js').DeebotEcovacsAPI;
const DeebotEcovacsConst = require('./deebotEcovacsConst');
const DeebotEcovacsTools = require('./deebotEcovacsTools.js');

function myDeebotEcovacslatform(log, config, api) {
  this.log = log;
  this.login = config['email'];
  this.password = config['password'];
  this.refreshTimer = DeebotEcovacsTools.checkTimer(config['refreshTimer']);

  this.foundAccessories = [];
  this.deebotEcovacsAPI = new DeebotEcovacsAPI(log, this);

  if (api) {
    // Save the API object as plugin needs to register new accessory via this object
    this.api = api;
  }
}

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerPlatform(
    'homebridge-deebotEcovacs',
    'HomebridgeDeebotEcovacs',
    myDeebotEcovacslatform
  );
};

myDeebotEcovacslatform.prototype = {
  accessories: function(callback) {
    this.deebotEcovacsAPI.authenticate(error => {
      if (error) {
        this.log.debug('ERROR - authenticating - ' + error);
        callback(undefined);
      } else {
        this.deebotEcovacsAPI.getDeebots(result => {
          if (result && result instanceof Array && result.length > 0) {
            for (let s = 0; s < result.length; s++) {
              this.log.debug('Deebot : ' + JSON.stringify(result[s]));
              let services = [];
              let deebotName = result[s].name;
              let deebotModel = result[s].model;
              let deebotSeriaNumber = result[s].id;

              let batteryService = {
                controlService: new Service.BatteryService(deebotName),
                characteristics: [
                  Characteristic.ChargingState,
                  Characteristic.StatusLowBattery,
                  Characteristic.BatteryLevel,
                ],
              };
              batteryService.controlService.subtype = deebotName;
              batteryService.controlService.id = result[s].id;
              services.push(batteryService);

              let fanService = {
                controlService: new Service.Fan(deebotName),
                characteristics: [Characteristic.On],
              };
              fanService.controlService.subtype = deebotName + 'Vacuum';
              fanService.controlService.id = result[s].id;
              services.push(fanService);

              let myDeebotEcovacsAccessory = new DeebotEcovacsTools.DeebotEcovacsAccessory(
                services
              );
              myDeebotEcovacsAccessory.getServices = function() {
                return this.platform.getServices(myDeebotEcovacsAccessory);
              };
              myDeebotEcovacsAccessory.platform = this;
              myDeebotEcovacsAccessory.name = deebotName;
              myDeebotEcovacsAccessory.model = deebotModel;
              myDeebotEcovacsAccessory.manufacturer = 'Ecovacs';
              myDeebotEcovacsAccessory.serialNumber = deebotSeriaNumber;
              myDeebotEcovacsAccessory.deebotID = deebotSeriaNumber;
              this.foundAccessories.push(myDeebotEcovacsAccessory);
            }

            //timer for background refresh
            this.refreshBackground();

            callback(this.foundAccessories);
          } else {
            //prevent homebridge from starting since we don't want to loose our deebots.
            this.log.debug('ERROR - gettingDeebots - ' + error);
            callback(undefined);
          }
        });
      }
    });
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

  getBatteryLevelCharacteristic: function(homebridgeAccessory, callback) {
    this.log.debug('INFO - getBatteryLevelCharacteristic');
    var percent = 0;
    this.deebotEcovacsAPI.authenticate(error => {
      if (error) {
        callback(undefined, percent);
      } else {
        this.deebotEcovacsAPI.getDeebots(result => {
          percent = this.getBatteryLevel(homebridgeAccessory, result);
          callback(undefined, percent);
        });
      }
    });
  },

  getChargingState(homebridgeAccessory, result) {
    var charging = 0;
    if (result && result instanceof Array && result.length > 0) {
      for (let s = 0; s < result.length; s++) {
        if (
          result[s].id === homebridgeAccessory.deebotID &&
          result[s].status &&
          result[s].status.connected &&
          (result[s].batteryPercent < 100 ||
            result[s].status.deebotStatus.activity.startsWith(
              DeebotEcovacsConst.CHARGING
            ))
        ) {
          charging = 1;
          break;
        }
      }
    }
    return charging;
  },

  getChargingStateCharacteristic: function(homebridgeAccessory, callback) {
    this.log.debug('INFO - getChargingStateCharacteristic');
    var charging = 0;

    this.deebotEcovacsAPI.authenticate(error => {
      if (error) {
        callback(undefined, charging);
      } else
        this.deebotEcovacsAPI.getDeebots(result => {
          charging = this.getChargingState(homebridgeAccessory, result);
          callback(undefined, charging);
        });
    });
  },

  isLowBattery(homebridgeAccessory, result) {
    var lowww = 0;
    if (result && result instanceof Array && result.length > 0) {
      for (let s = 0; s < result.length; s++) {
        if (
          result[s].id === homebridgeAccessory.deebotID &&
          result[s].status &&
          result[s].batteryPercent < 20
        ) {
          lowww = 1;
          break;
        }
      }
    }
    return lowww;
  },

  getLowBatteryCharacteristic: function(homebridgeAccessory, callback) {
    this.log.debug('INFO - getLowBatteryCharacteristic');
    var lowww = 0;
    this.deebotEcovacsAPI.authenticate(error => {
      if (error) {
        callback(undefined, lowww);
      } else
        this.deebotEcovacsAPI.getDeebots(result => {
          lowww = this.isLowBattery(homebridgeAccessory, result);
          callback(undefined, lowww);
        });
    });
  },

  isCleaning(homebridgeAccessory, result) {
    var cleaning = 0;
    if (result && result instanceof Array && result.length > 0) {
      for (let s = 0; s < result.length; s++) {
        if (
          result[s].id === homebridgeAccessory.deebotID &&
          result[s].status &&
          result[s].status.deebotStatus.activity.startsWith(
            DeebotEcovacsConst.CLEANING
          )
        ) {
          cleaning = 1;
          break;
        }
      }
    }
    return cleaning;
  },

  getDeebotEcovacsOnCharacteristic: function(homebridgeAccessory, callback) {
    this.log.debug('getDeebotEcovacsOnCharacteristic');

    var cleaning = 0;
    this.deebotEcovacsAPI.authenticate(error => {
      if (error) {
        callback(undefined, cleaning);
      } else
        this.deebotEcovacsAPI.getDeebots(result => {
          this.log.debug('INFO - Deebots result : ' + JSON.stringify(result));
          cleaning = this.isCleaning(homebridgeAccessory, result);
          callback(undefined, cleaning);
        });
    });
  },
  setDeebotEcovacsOnCharacteristic: function(
    homebridgeAccessory,
    characteristic,
    value,
    callback
  ) {
    this.log.debug('setDeebotEcovacsOnCharacteristic -' + value);
    this.deebotEcovacsAPI.sendCommand(
      homebridgeAccessory,
      value
        ? DeebotEcovacsConst.START_COMMAND
        : DeebotEcovacsConst.STOP_COMMAND,
      characteristic,
      callback
    );
  },

  bindCharacteristicEvents: function(
    characteristic,
    service,
    homebridgeAccessory
  ) {
    if (characteristic instanceof Characteristic.BatteryLevel) {
      characteristic.on(
        'get',
        function(callback) {
          homebridgeAccessory.platform.getBatteryLevelCharacteristic(
            homebridgeAccessory,
            callback
          );
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.ChargingState) {
      characteristic.on(
        'get',
        function(callback) {
          homebridgeAccessory.platform.getChargingStateCharacteristic(
            homebridgeAccessory,
            callback
          );
        }.bind(this)
      );
    } else if (characteristic instanceof Characteristic.StatusLowBattery) {
      characteristic.on(
        'get',
        function(callback) {
          homebridgeAccessory.platform.getLowBatteryCharacteristic(
            homebridgeAccessory,
            callback
          );
        }.bind(this)
      );
    } else if (
      characteristic instanceof Characteristic.On &&
      service.controlService instanceof Service.Fan
    ) {
      characteristic.on(
        'get',
        function(callback) {
          homebridgeAccessory.platform.getDeebotEcovacsOnCharacteristic(
            homebridgeAccessory,
            callback
          );
        }.bind(this)
      );

      characteristic.on(
        'set',
        function(value, callback) {
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
        'INFO - Setting Timer for background refresh every  : ' +
          this.refreshTimer +
          's'
      );
      this.timerID = setInterval(
        () => this.refreshAllDeebots(),
        this.refreshTimer * 1000
      );
    }
  },

  refreshAllDeebots: function() {
    this.deebotEcovacsAPI.authenticate(error => {
      if (error) {
        this.log.debug('ERROR - authenticating - ' + error);
        callback(undefined);
      } else {
        this.deebotEcovacsAPI.getDeebots(result => {
          for (let a = 0; a < this.foundAccessories.length; a++) {
            this.log.debug(
              'INFO - refreshing - ' + this.foundAccessories[a].name
            );
            this.refreshDeebot(this.foundAccessories[a], result);
          }
        });
      }
    });
  },

  refreshDeebot: function(myDeebotEcovacsAccessory, result) {
    for (let s = 0; s < myDeebotEcovacsAccessory.services.length; s++) {
      let service = myDeebotEcovacsAccessory.services[s];

      if (service.controlService instanceof Service.BatteryService) {
        service.controlService
          .getCharacteristic(Characteristic.BatteryLevel)
          .updateValue(this.getBatteryLevel(myDeebotEcovacsAccessory, result));
        service.controlService
          .getCharacteristic(Characteristic.ChargingState)
          .updateValue(this.getChargingState(myDeebotEcovacsAccessory, result));
        service.controlService
          .getCharacteristic(Characteristic.StatusLowBattery)
          .updateValue(this.isLowBattery(myDeebotEcovacsAccessory, result));
      }

      if (service.controlService instanceof Service.Fan) {
        service.controlService
          .getCharacteristic(Characteristic.On)
          .updateValue(this.isCleaning(myDeebotEcovacsAccessory, result));
      }
    }
  },

  getInformationService: function(homebridgeAccessory) {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Name, homebridgeAccessory.name)
      .setCharacteristic(
        Characteristic.Manufacturer,
        homebridgeAccessory.manufacturer
      )
      .setCharacteristic(Characteristic.Model, homebridgeAccessory.model)
      .setCharacteristic(
        Characteristic.SerialNumber,
        homebridgeAccessory.serialNumber
      );
    return informationService;
  },

  getServices: function(homebridgeAccessory) {
    let services = [];
    let informationService = homebridgeAccessory.platform.getInformationService(
      homebridgeAccessory
    );
    services.push(informationService);
    for (let s = 0; s < homebridgeAccessory.services.length; s++) {
      let service = homebridgeAccessory.services[s];
      for (let i = 0; i < service.characteristics.length; i++) {
        let characteristic = service.controlService.getCharacteristic(
          service.characteristics[i]
        );
        if (characteristic == undefined)
          characteristic = service.controlService.addCharacteristic(
            service.characteristics[i]
          );

        homebridgeAccessory.platform.bindCharacteristicEvents(
          characteristic,
          service,
          homebridgeAccessory
        );
      }
      services.push(service.controlService);
    }
    return services;
  },
};
