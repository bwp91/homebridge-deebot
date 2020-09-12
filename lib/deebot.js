/* jshint esversion: 9, -W030, node: true */
"use strict";
const deebot = require("ecovacs-deebot"),
   nodeMachineId = require("node-machine-id");
let Accessory, Characteristic, Service, UUIDGen;
class Deebot {
   constructor(log, config, api) {
      if (!log || !api || !config) return;
      if (!config.email || !config.password || !config.countryCode) {
         log.error("**************** Cannot load homebridge-deebot *****************");
         log.error("Your ECOVACS credentials are missing from the Homebridge config.");
         log.error("****************************************************************");
         return;
      }
      this.log = log;
      this.config = config;
      this.api = api;
      this.debug = this.config.debug || false;
      this.ecovacsAPI = new deebot.EcoVacsAPI(
         deebot.EcoVacsAPI.md5(nodeMachineId.machineIdSync()),
         this.config.countryCode,
         deebot.countries[this.config.countryCode].continent.toUpperCase()
      );
      this.cleanCache = this.config.cleanCache || false;
      this.refreshTimer = this.config.refreshTimer >= 30 && this.config.refreshTimer <= 600 ? this.config.refreshTimer : 300;
      this.hideBeepSwitch = this.config.hideBeepSwitch || false;
      this.hideSwitch = this.config.hideSwitch || false;
      this.hideFan = this.config.hideFan || false;
      this.hideMotionDetector = this.config.hideMotionDetector || false;
      this.leftDirectionCleaningMode = this.config.leftDirectionCleaningMode || "edge";
      this.rightDirectionCleaningMode = this.config.rightDirectionCleaningMode || "auto";
      this.deviceList = [];
      this.foundAccessories = [];
      this._confirmedAccessories = [];
      this._confirmedServices = [];
      this.api
         .on("didFinishLaunching", () => {
            if (this.cleanCache) {
               this.log.warn("Removing all Deebot devices from Homebridge.");
               this.api.unregisterPlatformAccessories("homebridge-deebot", "Deebot", this.foundAccessories);
               this.foundAccessories = [];
            }
            let getDeebots = () => {
               this.ecovacsAPI.connect(this.config.email, deebot.EcoVacsAPI.md5(this.config.password))
                  .then(() => {
                     this.ecovacsAPI.devices()
                        .then(devices => {
                           let deviceList = [];
                           devices.forEach(device => deviceList.push(
                              this.ecovacsAPI.getVacBot(
                                 this.ecovacsAPI.uid,
                                 deebot.EcoVacsAPI.REALM,
                                 this.ecovacsAPI.resource,
                                 this.ecovacsAPI.user_access_token,
                                 device,
                                 deebot.countries[this.config.countryCode].continent.toUpperCase()
                              )
                           ));
                           this.deviceList = deviceList;
                           if (this.deviceList.length > 0) {
                              this.loadDeebots();
                           } else {
                              this.log.warn("No Deebot devices were found. Will try discovery again in 1 minute.");
                              setTimeout(() => {
                                 getDeebots();
                              }, 60000);
                           }
                        });
                  })
                  .catch(err => {
                     this.log.error("Could not retrieve Deebot devices as %s. Will try discovery again in 1 minute.", err);
                     setTimeout(() => {
                        getDeebots();
                     }, 60000);
                  });
            };
            getDeebots();
         })
         .on("shutdown", () => {
            if (this.timerID) {
               clearInterval(this.timerID);
               this.timerID = undefined;
            }
            this.foundAccessories.forEach(acc => {
               if (acc.vacBot && acc.vacBot.is_ready) {
                  acc.vacBot.disconnect;
               }
            });
         });
   }
   configureAccessory(accessory) {
      this.foundAccessories.push(accessory);
   }
   loadDeebots() {
      this.deviceList.forEach(device => {
         let deebotName = device.vacuum.nick || device.vacuum.name;
         this.log("INFO - Discovered Deebot: " + deebotName);
         let uuid = UUIDGen.generate(deebotName);
         let myDeebotEcovacsAccessory = this.foundAccessories.find(x => x.UUID === uuid);
         if (!myDeebotEcovacsAccessory) {
            myDeebotEcovacsAccessory = new Accessory(deebotName, uuid);
            myDeebotEcovacsAccessory.name = deebotName;
            myDeebotEcovacsAccessory.manufacturer = device.vacuum.company;
            myDeebotEcovacsAccessory.serialNumber = device.vacuum.did;
            myDeebotEcovacsAccessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, myDeebotEcovacsAccessory.manufacturer).setCharacteristic(Characteristic.Model, myDeebotEcovacsAccessory.model).setCharacteristic(Characteristic.SerialNumber, myDeebotEcovacsAccessory.serialNumber);
            this.api.registerPlatformAccessories('homebridge-deebot', 'Deebot', [myDeebotEcovacsAccessory]);
            this.foundAccessories.push(myDeebotEcovacsAccessory);
         }
         myDeebotEcovacsAccessory.vacBot = device;
         myDeebotEcovacsAccessory.name = deebotName;
         let HKBatteryService, HKFanService, HKSwitchOnService, HKSwitchBipService, HKMotionService;
         HKBatteryService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(deebotName, 'BatteryService' + deebotName);
         if (!HKBatteryService) {
            this.log("INFO - Creating Battery Service " + deebotName);
            HKBatteryService = new Service.BatteryService(deebotName, "BatteryService" + deebotName);
            HKBatteryService.subtype = "BatteryService" + deebotName;
            myDeebotEcovacsAccessory.addService(HKBatteryService);
         }
         this.bindBatteryLevelCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);
         this.bindChargingStateCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);
         this.bindStatusLowBatteryCharacteristic(myDeebotEcovacsAccessory, HKBatteryService);
         this._confirmedServices.push(HKBatteryService);
         if (!this.hideFan) {
            HKFanService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType("Start/Pause " + deebotName, "FanService" + deebotName);
            if (!HKFanService) {
               this.log("INFO - Creating Fan Service " + deebotName);
               HKFanService = new Service.Fan("Start/Pause " + deebotName, "FanService" + deebotName);
               HKFanService.subtype = "FanService" + deebotName;
               myDeebotEcovacsAccessory.addService(HKFanService);
            }
            HKFanService.type = "fan";
            this.bindOnCharacteristic(myDeebotEcovacsAccessory, HKFanService);
            this.bindRotationSpeedCharacteristic(myDeebotEcovacsAccessory, HKFanService);
            if (this.leftDirectionCleaningMode !== "" && this.rightDirectionCleaningMode !== "") {
               this.bindRotationDirectionCharacteristic(myDeebotEcovacsAccessory, HKFanService);
            }
            HKFanService.setPrimaryService(true);
            this._confirmedServices.push(HKFanService);
         }
         if (this.hideSwitch) {
            HKSwitchOnService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType("Start/Stop " + deebotName, "SwitchOnService" + deebotName);
            if (!HKSwitchOnService) {
               this.log("INFO - Creating Main Switch Service " + deebotName);
               HKSwitchOnService = new Service.Switch("Start/Stop " + deebotName, "SwitchOnService" + deebotName);
               HKSwitchOnService.subtype = "SwitchOnService" + deebotName;
               myDeebotEcovacsAccessory.addService(HKSwitchOnService);
            }
            this.bindSwitchOnCharacteristic(myDeebotEcovacsAccessory, HKSwitchOnService);
            HKSwitchOnService.setPrimaryService(true);
            this._confirmedServices.push(HKSwitchOnService);
         }
         if (!this.hideBeepSwitch) {
            HKSwitchBipService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType("Bip " + deebotName, "SwitchBipService" + deebotName);
            if (!HKSwitchBipService) {
               this.log("INFO - Creating Sound stateless Switch Service " + deebotName);
               HKSwitchBipService = new Service.Switch("Bip " + deebotName, "SwitchBipService" + deebotName);
               HKSwitchBipService.subtype = 'SwitchBipService' + deebotName;
               myDeebotEcovacsAccessory.addService(HKSwitchBipService);
            }
            this.bindSwitchBipCharacteristic(myDeebotEcovacsAccessory, HKSwitchBipService);
            this._confirmedServices.push(HKSwitchBipService);
         }
         if (!this.hideMotionDetector) {
            HKMotionService = myDeebotEcovacsAccessory.getServiceByUUIDAndSubType(deebotName + " needs attention", "MotionService" + deebotName);
            if (!HKMotionService) {
               this.log("INFO - Creating Motion Service " + deebotName);
               HKMotionService = new Service.MotionSensor(deebotName + " needs attention", "MotionService" + deebotName);
               HKMotionService.subtype = "MotionService" + deebotName;
               myDeebotEcovacsAccessory.addService(HKMotionService);
            }
            this.bindMotionCharacteristic(HKMotionService);
            this._confirmedServices.push(HKMotionService);
         }
         this.configureEvents(device, HKBatteryService, HKFanService, HKSwitchOnService, HKMotionService, this);
         this._confirmedAccessories.push(myDeebotEcovacsAccessory);
      });
      let accstoRemove = [],
         servicestoRemove = [];
      this.foundAccessories.forEach(acc => {
         if (!this._confirmedAccessories.find(x => x.UUID === acc.UUID)) {
            accstoRemove.push(acc);
            this.log.warn("[%s] will be removed from Homebridge.", acc.displayName);
         }
         acc.services.forEach(serv => {
            if (serv.subtype !== undefined && !this._confirmedServices.find(x => x.UUID === serv.UUID && x.subtype === serv.subtype)) {
               servicestoRemove.push(serv);
            }
         });
         servicestoRemove.forEach(s => {
            this.log.warn("[%s] will have service [%s] removed.", acc.displayName, s.displayName);
            acc.removeService(s);
         });
      });
      if (accstoRemove.length > 0) {
         this.api.unregisterPlatformAccessories("homebridge-deebot", "Deebot", accstoRemove);
      }
      if (this.refreshTimer !== undefined && this.refreshTimer > 0) {
         this.timerID = setInterval(() => this.refreshAllDeebots(), this.refreshTimer * 1000);
      }
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
         order = this.leftDirectionCleaningMode.split(",");
         if (order[0].toLowerCase() === "auto") {
            orderToSend = orderToSend.concat(this.leftDirectionCleaningMode.split(","));
         } else {
            orderToSend = this.leftDirectionCleaningMode.split(",");
         }
      } else {
         order = this.rightDirectionCleaningMode.split(",");
         if (order[0].toLowerCase() === "auto") {
            orderToSend = orderToSend.concat(this.rightDirectionCleaningMode.split(","));
         } else {
            orderToSend = this.rightDirectionCleaningMode.split(",");
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