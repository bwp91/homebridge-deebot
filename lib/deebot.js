/* jshint esversion: 9, -W030, node: true */
"use strict";
const deebot = require("ecovacs-deebot"),
   nodeMachineId = require("node-machine-id");
let Accessory, Characteristic, Service, UUIDGen;
class Deebot {
   constructor(log, config, api) {
      if (!log || !api || !config) return;
      if (!config.username || !config.password || !config.countryCode) {
         log.error("**************** Cannot load homebridge-deebot *****************");
         log.error("Your ECOVACS credentials are missing from the Homebridge config.");
         log.error("****************************************************************");
         return;
      }
      this.log = log;
      this.config = config;
      this.api = api;
      this.debug = this.config.debug || false;
      this.devicesInHB = new Map();
      this.devicesInECO = new Map();
      this.ecovacsAPI = new deebot.EcoVacsAPI(
         deebot.EcoVacsAPI.md5(nodeMachineId.machineIdSync()),
         this.config.countryCode,
         deebot.countries[this.config.countryCode].continent.toUpperCase()
      );
      this.deviceList = [];
      this.foundAccessories = [];
      this._confirmedAccessories = [];
      this._confirmedServices = [];
      this.api
         .on("didFinishLaunching", () => {
            this.log("Plugin has finished initialising. Starting synchronisation with ECOVACS account.");
            let getDeebots = () => {
               this.ecovacsAPI.connect(this.config.username, deebot.EcoVacsAPI.md5(this.config.password))
                  .then(() => {
                     this.ecovacsAPI.devices()
                        .then(devices => {
                           devices.forEach(device => this.devicesInECO.set(device.did,
                              this.ecovacsAPI.getVacBot(
                                 this.ecovacsAPI.uid,
                                 deebot.EcoVacsAPI.REALM,
                                 this.ecovacsAPI.resource,
                                 this.ecovacsAPI.user_access_token,
                                 device,
                                 deebot.countries[this.config.countryCode].continent.toUpperCase()
                              )
                           ));
                           if (this.deviceList.size === 0) {
                              this.log.warn("No Deebot devices were found. Will try discovery again in 1 minute.");
                              setTimeout(() => getDeebots(), 60000);
                              this.loadDeebots();
                              return;
                           }
                           this.devicesInECO.forEach(d => this.initialiseDevice(d));
                           this.refreshTimer = this.config.ref >= 30 && this.config.ref <= 600 ? this.config.ref : 300;
                           this.timer = setInterval(() => this.refreshAllDeebots(), this.refreshTimer * 1000);
                        });
                  })
                  .catch(err => {
                     this.log.error("Could not retrieve Deebot devices as %s. Will try discovery again in 1 minute.", err);
                     setTimeout(() => getDeebots(), 60000);
                  });
            };
            getDeebots();
         })
         .on("shutdown", () => {
            if (this.timer) clearInterval(this.timer);
            this.foundAccessories.forEach(acc => {
               if (acc.vacBot && acc.vacBot.is_ready) {
                  acc.vacBot.disconnect;
               }
            });
         });
   }
   initialiseDevice(device) {
      let deebotName = device.vacuum.nick || device.vacuum.did,
         accessory;
      this.log("[%s] found in your ECOVACS account.", deebotName);
      if (this.devicesInHB.has(device.vacuum.did)) {
         accessory = this.devicesInHB.get(device.vacuum.did);
      } else {
         accessory = new Accessory(deebotName, UUIDGen.generate(deebotName));
         accessory.context.ecoDeviceId = device.vacuum.did;
         try {
            accessory.getService(Service.AccessoryInformation)
               .setCharacteristic(Characteristic.SerialNumber, device.vacuum.did)
               .setCharacteristic(Characteristic.Manufacturer, device.vacuum.company)
               .setCharacteristic(Characteristic.Model, device.deviceModel)
               .setCharacteristic(Characteristic.Identify, false);
            this.devicesInHB.set(device.vacuum.did, accessory);
            this.api.registerPlatformAccessories('homebridge-deebot', 'Deebot', [accessory]);
            this.log("[%s] has been added to Homebridge.", deebotName);
            // temp
            this.foundAccessories.push(accessory);
            // temp
         } catch (err) {
            this.log.warn("[%s] could not be added as %s.", deebotName, err);
         }
      }
      accessory.vacBot = device;
      let HKBatteryService, HKFanService, HKSwitchOnService, HKSwitchBipService, HKMotionService;
      HKBatteryService = accessory.getServiceByUUIDAndSubType(deebotName, 'BatteryService' + deebotName);
      if (!HKBatteryService) {
         this.log("INFO - Creating Battery Service " + deebotName);
         HKBatteryService = new Service.BatteryService(deebotName, "BatteryService" + deebotName);
         HKBatteryService.subtype = "BatteryService" + deebotName;
         accessory.addService(HKBatteryService);
      }
      this.bindBatteryLevelCharacteristic(accessory, HKBatteryService);
      this.bindChargingStateCharacteristic(accessory, HKBatteryService);
      this.bindStatusLowBatteryCharacteristic(accessory, HKBatteryService);
      this._confirmedServices.push(HKBatteryService);
      if (!this.config.hideFan || false) {
         HKFanService = accessory.getServiceByUUIDAndSubType("Start/Pause " + deebotName, "FanService" + deebotName);
         if (!HKFanService) {
            this.log("INFO - Creating Fan Service " + deebotName);
            HKFanService = new Service.Fan("Start/Pause " + deebotName, "FanService" + deebotName);
            HKFanService.subtype = "FanService" + deebotName;
            accessory.addService(HKFanService);
         }
         HKFanService.type = "fan";
         this.bindOnCharacteristic(accessory, HKFanService);
         this.bindRotationSpeedCharacteristic(accessory, HKFanService);
         if ("auto" !== "" && "auto" !== "") {
            this.bindRotationDirectionCharacteristic(accessory, HKFanService);
         }
         HKFanService.setPrimaryService(true);
         this._confirmedServices.push(HKFanService);
      }
      if (!this.config.hideSwitch || false) {
         HKSwitchOnService = accessory.getServiceByUUIDAndSubType("Start/Stop " + deebotName, "SwitchOnService" + deebotName);
         if (!HKSwitchOnService) {
            this.log("INFO - Creating Main Switch Service " + deebotName);
            HKSwitchOnService = new Service.Switch("Start/Stop " + deebotName, "SwitchOnService" + deebotName);
            HKSwitchOnService.subtype = "SwitchOnService" + deebotName;
            accessory.addService(HKSwitchOnService);
         }
         this.bindSwitchOnCharacteristic(accessory, HKSwitchOnService);
         HKSwitchOnService.setPrimaryService(true);
         this._confirmedServices.push(HKSwitchOnService);
      }
      if (!this.config.hideBeepSwitch || false) {
         HKSwitchBipService = accessory.getServiceByUUIDAndSubType("Bip " + deebotName, "SwitchBipService" + deebotName);
         if (!HKSwitchBipService) {
            this.log("INFO - Creating Sound stateless Switch Service " + deebotName);
            HKSwitchBipService = new Service.Switch("Bip " + deebotName, "SwitchBipService" + deebotName);
            HKSwitchBipService.subtype = 'SwitchBipService' + deebotName;
            accessory.addService(HKSwitchBipService);
         }
         this.bindSwitchBipCharacteristic(accessory, HKSwitchBipService);
         this._confirmedServices.push(HKSwitchBipService);
      }
      if (!this.config.hideMotionDetector || false) {
         HKMotionService = accessory.getServiceByUUIDAndSubType(deebotName + " needs attention", "MotionService" + deebotName);
         if (!HKMotionService) {
            this.log("INFO - Creating Motion Service " + deebotName);
            HKMotionService = new Service.MotionSensor(deebotName + " needs attention", "MotionService" + deebotName);
            HKMotionService.subtype = "MotionService" + deebotName;
            accessory.addService(HKMotionService);
         }
         this.bindMotionCharacteristic(HKMotionService);
         this._confirmedServices.push(HKMotionService);
      }
      this.configureEvents(device, HKBatteryService, HKFanService, HKSwitchOnService, HKMotionService, this);
      this._confirmedAccessories.push(accessory);
   }
   configureAccessory(accessory) {
      if (!this.log) return;
      this.foundAccessories.push(accessory);
      this.devicesInHB.set(accessory.context.ecoDeviceId, accessory);
   }
   getBatteryLevel(battery) {
      let batteryLevel = Math.round(battery);
      if (batteryLevel > 100) batteryLevel = 100;
      else if (batteryLevel < 0) batteryLevel = 0;
      return batteryLevel;
   }
   getCleanSpeed(value) {
      let speed = 2;
      if (value <= 25) speed = 1;
      else if (value > 50 && value <= 75) speed = 3;
      else if (value > 75) speed = 4;
      return speed;
   }
   getFanSpeed(value) {
      let speed = 50;
      if (value === 1) speed = 25;
      else if (value === 2) speed = 50;
      else if (value === 3) speed = 75;
      else if (value === 4) speed = 100;
      return speed;
   }
   getBatteryLevelCharacteristic(homebridgeAccessory, service, callback) {
      if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
         homebridgeAccessory.vacBot.run("GetBatteryState");
      } else {
         homebridgeAccessory.vacBot.connect_and_wait_until_ready();
      }
      callback(undefined, service.getCharacteristic(Characteristic.BatteryLevel).value);
   }
   getChargingStateCharacteristic(homebridgeAccessory, service, callback) {
      callback(undefined, service.getCharacteristic(Characteristic.ChargingState).value);
   }
   getLowBatteryCharacteristic(homebridgeAccessory, service, callback) {
      callback(undefined, service.getCharacteristic(Characteristic.StatusLowBattery).value);
   }
   getDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, callback) {
      setTimeout(() => {
         if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
            homebridgeAccessory.vacBot.run("GetCleanState");
            homebridgeAccessory.vacBot.run("GetChargeState");
         } else {
            homebridgeAccessory.vacBot.connect_and_wait_until_ready();
         }
      }, 1000);
      callback(undefined, service.getCharacteristic(Characteristic.On).value);
   }
   getOrder(currentDirectionValue) {
      let orderToSend = ["clean"],
         order;
      if (currentDirectionValue === 1) {
         order = "auto".split(",");
         if (order[0].toLowerCase() === "auto") {
            orderToSend = orderToSend.concat("auto".split(","));
         } else {
            orderToSend = "auto".split(",");
         }
      } else {
         order = "auto".split(",");
         if (order[0].toLowerCase() === "auto") {
            orderToSend = orderToSend.concat("auto".split(","));
         } else {
            orderToSend = "auto".split(",");
         }
      }
      return orderToSend;
   }
   setDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, value, callback) {
      let currentState = service.getCharacteristic(Characteristic.On).value;
      if (value !== currentState) {
         let orderToSend = service.type === "fan" ? ["Stop"] : ["Charge"];
         if (value === 1) {
            let HKFanService = service,
               currentDirectionValue = 0;
            if (service.type !== "fan") {
               HKFanService = homebridgeAccessory.getServiceByUUIDAndSubType("Start/Pause " + homebridgeAccessory.name, "FanService" + homebridgeAccessory.name);
            }
            if (HKFanService) {
               currentDirectionValue = HKFanService.getCharacteristic(Characteristic.RotationDirection).value;
            }
            orderToSend = this.getOrder(currentDirectionValue);
         }
         this.log("INFO - setDeebotEcovacsOnCharacteristic -" + value + "-" + currentState + "-" + orderToSend);
         if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
            homebridgeAccessory.vacBot.run.apply(homebridgeAccessory.vacBot, orderToSend);
         } else {
            homebridgeAccessory.vacBot.orderToSend = orderToSend;
            homebridgeAccessory.vacBot.connect_and_wait_until_ready();
         }
      }
      callback();
   }
   getDeebotEcovacsModeCharacteristic(service, callback) {
      callback(undefined, service.getCharacteristic(Characteristic.RotationDirection).value);
   }
   setDeebotEcovacsModeCharacteristic(homebridgeAccessory, service, value, callback) {
      let currentDirectionValue = service.getCharacteristic(Characteristic.RotationDirection).value,
         isOn = service.getCharacteristic(Characteristic.On).value;
      if (currentDirectionValue !== value && isOn) {
         let orderToSend = this.getOrder(currentDirectionValue);
         if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
            homebridgeAccessory.vacBot.run.apply(homebridgeAccessory.vacBot, orderToSend);
         } else {
            homebridgeAccessory.vacBot.orderToSend = orderToSend;
            homebridgeAccessory.vacBot.connect_and_wait_until_ready();
         }
      }
      callback();
   }
   getDeebotEcovacsSpeedCharacteristic(homebridgeAccessory, service, callback) {
      callback(undefined, service.getCharacteristic(Characteristic.RotationSpeed).value);
   }
   setDeebotEcovacsSpeedCharacteristic(homebridgeAccessory, service, value, callback) {
      let speed = this.getCleanSpeed(value),
         currentSpeedValue = service.getCharacteristic(Characteristic.RotationSpeed).value,
         deebotSpeed = this.getCleanSpeed(currentSpeedValue);
      if (deebotSpeed !== speed) {
         let orderToSend = ["SetCleanSpeed", "" + speed];
         if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
            homebridgeAccessory.vacBot.run.apply(homebridgeAccessory.vacBot, orderToSend);
         } else {
            homebridgeAccessory.vacBot.orderToSend = orderToSend;
            homebridgeAccessory.vacBot.connect_and_wait_until_ready();
         }
      }
      callback();
   }
   setDeebotEcovacsBipCharacteristic(homebridgeAccessory, service, value, callback) {
      if (homebridgeAccessory.vacBot && homebridgeAccessory.vacBot.is_ready) {
         homebridgeAccessory.vacBot.run("playsound");
      } else {
         homebridgeAccessory.vacBot.orderToSend = "playsound";
         homebridgeAccessory.vacBot.connect_and_wait_until_ready();
      }
      callback();
      setTimeout(() => {
         service.getCharacteristic(Characteristic.On).updateValue(false);
      }, 1000);
   }
   bindBatteryLevelCharacteristic(homebridgeAccessory, service) {
      service.getCharacteristic(Characteristic.BatteryLevel).on("get", callback => {
         this.getBatteryLevelCharacteristic(homebridgeAccessory, service, callback);
      });
   }
   bindChargingStateCharacteristic(homebridgeAccessory, service) {
      service.getCharacteristic(Characteristic.ChargingState).on("get", callback => {
         this.getChargingStateCharacteristic(homebridgeAccessory, service, callback);
      });
   }
   bindStatusLowBatteryCharacteristic(homebridgeAccessory, service) {
      service.getCharacteristic(Characteristic.StatusLowBattery).on("get", callback => {
         this.getLowBatteryCharacteristic(homebridgeAccessory, service, callback);
      });
   }
   bindOnCharacteristic(homebridgeAccessory, service) {
      service.getCharacteristic(Characteristic.On).on("get", callback => {
         this.getDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, callback);
      }).on("set", (value, callback) => {
         this.setDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, value, callback);
      });
   }
   bindRotationDirectionCharacteristic(homebridgeAccessory, service) {
      service.getCharacteristic(Characteristic.RotationDirection).on("get", callback => {
         this.getDeebotEcovacsModeCharacteristic(service, callback);
      }).on("set", (value, callback) => {
         this.setDeebotEcovacsModeCharacteristic(homebridgeAccessory, service, value, callback);
      });
   }
   bindRotationSpeedCharacteristic(homebridgeAccessory, service) {
      service.getCharacteristic(Characteristic.RotationSpeed).on("get", callback => {
         this.getDeebotEcovacsSpeedCharacteristic(homebridgeAccessory, service, callback);
      }).on("set", (value, callback) => {
         this.setDeebotEcovacsSpeedCharacteristic(homebridgeAccessory, service, value, callback);
      });
   }
   bindSwitchOnCharacteristic(homebridgeAccessory, service) {
      service.getCharacteristic(Characteristic.On).on("get", callback => {
         this.getDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, callback);
      }).on("set", (value, callback) => {
         this.setDeebotEcovacsOnCharacteristic(homebridgeAccessory, service, value, callback);
      });
   }
   bindSwitchBipCharacteristic(homebridgeAccessory, service) {
      service.getCharacteristic(Characteristic.On).on("get", callback => {
         callback(false);
      }).on("set", (value, callback) => {
         this.setDeebotEcovacsBipCharacteristic(homebridgeAccessory, service, value, callback);
      });
   }
   bindMotionCharacteristic(service) {
      service.getCharacteristic(Characteristic.MotionDetected).on("get", callback => {
         callback(false);
      });
   }
   refreshAllDeebots() {
      for (let a = 0; a < this.foundAccessories.length; a++) {
         if (this.foundAccessories[a].vacBot && this.foundAccessories[a].vacBot.is_ready) {
            this.foundAccessories[a].vacBot.run("GetBatteryState");
            this.foundAccessories[a].vacBot.run("GetChargeState");
            this.foundAccessories[a].vacBot.run("GetCleanState");
         } else {
            this.foundAccessories[a].vacBot.connect_and_wait_until_ready();
         }
      }
   }
   configureEvents(vacBot, HKBatteryService, HKFanService, HKSwitchOnService, HKMotionService, deebotAccessory) {
      let displayName = vacBot.vacuum.nick || vacBot.vacuum.name;
      vacBot.on("ready", event => {
         vacBot.run("GetCleanState");
         vacBot.run("GetBatteryState");
         vacBot.run("GetChargeState");
         vacBot.run("GetCleanSpeed");
         if (vacBot.orderToSend) {
            if (this.debug) {
               this.log("[%s] sending command [%s].", displayName, vacBot.orderToSend);
            }
            if (Array.isArray(vacBot.orderToSend)) {
               vacBot.run.apply(vacBot, vacBot.orderToSend);
            } else {
               vacBot.run(vacBot.orderToSend);
            }
            vacBot.orderToSend = undefined;
         }
      });
      vacBot.on("BatteryInfo", battery => {
         let batteryLevel = this.getBatteryLevel(battery),
            currentValue = HKBatteryService.getCharacteristic(Characteristic.BatteryLevel).value;
         if (currentValue !== batteryLevel) {
            HKBatteryService.updateCharacteristic(Characteristic.BatteryLevel, batteryLevel);
            HKBatteryService.updateCharacteristic(Characteristic.StatusLowBattery, batteryLevel < 20);
         }
         if (this.debug) {
            this.log("[%s] battery level updated to [%s%].", displayName, batteryLevel);
         }
      });
      vacBot.on("ChargeState", chargeStatus => {
         let charging = chargeStatus === "charging",
            idle = chargeStatus === "idle",
            returning = chargeStatus === "returning",
            currentValue = HKBatteryService.getCharacteristic(Characteristic.ChargingState).value;
         if (this.debug) {
            this.log("[%s] charging status is [%s %s %s].", displayName, chargeStatus, idle, charging);
         }
         if (currentValue !== charging) {
            HKBatteryService.updateCharacteristic(Characteristic.ChargingState, charging);
         }
         if (!deebotAccessory.hideFan && HKFanService) {
            let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;
            if (charging && currentOnValue) {
               HKFanService.updateCharacteristic(Characteristic.On, false);
            } else if (returning && !currentOnValue) {
               HKFanService.updateCharacteristic(Characteristic.On, true);
            }
         }
         if (!deebotAccessory.hideSwitch && HKSwitchOnService) {
            let currentMainOnValue = HKSwitchOnService.getCharacteristic(Characteristic.On).value;
            if (charging && currentMainOnValue) {
               HKSwitchOnService.updateCharacteristic(Characteristic.On, false);
            } else if (idle && !currentMainOnValue) {
               HKSwitchOnService.updateCharacteristic(Characteristic.On, true);
            }
         }
      });
      vacBot.on("CleanReport", cleanStatus => {
         if (this.debug) {
            this.log("[%s] cleaning status is [%s].", displayName, cleanStatus);
         }
         if (cleanStatus) {
            let cleaning = cleanStatus !== "stop" && cleanStatus !== "pause" && cleanStatus !== "idle";
            if (!deebotAccessory.hideFan && HKFanService) {
               let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;
               if (currentOnValue !== cleaning) {
                  HKFanService.updateCharacteristic(Characteristic.On, cleaning);
               }
               let currentDirectionValue = HKFanService.getCharacteristic(Characteristic.RotationDirection).value;
               if (cleanStatus === deebotAccessory.leftDirectionCleaningMode && currentDirectionValue === 0) {
                  HKFanService.updateCharacteristic(Characteristic.RotationDirection, 0);
               } else if (cleanStatus !== deebotAccessory.leftDirectionCleaningMode && currentDirectionValue === 1) {
                  HKFanService.updateCharacteristic(Characteristic.RotationDirection, 1);
               }
            }
            if (!deebotAccessory.hideSwitch && HKSwitchOnService) {
               let currentMainOnValue = HKSwitchOnService.getCharacteristic(Characteristic.On).value;
               if (cleaning && !currentMainOnValue) {
                  HKSwitchOnService.updateCharacteristic(Characteristic.On, true);
               }
            }
         }
      });
      vacBot.on("CleanSpeed", cleanSpeed => {
         if (!deebotAccessory.hideFan && HKFanService) {
            let currentSpeedValue = HKFanService.getCharacteristic(Characteristic.RotationSpeed).value,
               deebotSpeed = this.getCleanSpeed(currentSpeedValue);
            if (this.debug) {
               this.log("[%s] cleaning speed is [%s - %s].", displayName, cleanSpeed, deebotSpeed);
            }
            if (deebotSpeed !== cleanSpeed) {
               HKFanService.updateCharacteristic(Characteristic.RotationSpeed, this.getFanSpeed(cleanSpeed));
            }
         }
      });
      vacBot.on("Error", err => {
         this.log.error("[%s] received an error - %s.", displayName, err);
         if (!deebotAccessory.hideMotionDetector && HKMotionService && err) {
            HKMotionService.getCharacteristic(Characteristic.MotionDetected, true);
         }
      });
      vacBot.on("message", msg => this.log("[%s] %s.", displayName, msg));
      if (!vacBot.is_ready) {
         vacBot.connect_and_wait_until_ready();
      }
   }
}
module.exports = function(homebridge) {
   Accessory = homebridge.platformAccessory;
   Service = homebridge.hap.Service;
   Characteristic = homebridge.hap.Characteristic;
   UUIDGen = homebridge.hap.uuid;
   return Deebot;
};