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
                           if (this.devicesInECO.size === 0) {
                              this.log.warn("No Deebot devices were found. Will try discovery again in 1 minute.");
                              setTimeout(() => getDeebots(), 60000);
                              this.loadDeebots();
                              return;
                           }
                           this.devicesInECO.forEach(d => this.initialiseDevice(d));
                           this.refreshTimer = this.config.ref >= 30 && this.config.ref <= 600 ? this.config.ref : 300;
                           this.timer = setInterval(() => {
                              this.devicesInHB.forEach(a => {
                                 if (a.deebot.is_ready) {
                                    a.deebot.run("GetBatteryState");
                                    a.deebot.run("GetChargeState");
                                    a.deebot.run("GetCleanState");
                                 } else {
                                    a.deebot.connect_and_wait_until_ready();
                                 }
                              });
                           }, this.refreshTimer * 1000);
                        });
                  })
                  .catch(err => {
                     this.log.warn("Could not retrieve Deebot devices. Will try discovery again in 1 minute.\n%s", err);
                     setTimeout(() => getDeebots(), 60000);
                  });
            };
            getDeebots();
         })
         .on("shutdown", () => {
            if (this.timer) clearInterval(this.timer);
            this.devicesInHB.forEach(a => {
               if (a.deebot.is_ready) {
                  a.deebot.disconnect;
               }
            });
         });
   }
   initialiseDevice(device) {
      let accessory, displayName = device.vacuum.nick || device.vacuum.did;
      //*** First add the device if it isn't already in Homebridge ***\\
      if (!this.devicesInHB.has(device.vacuum.did)) {
         this.addAccessory(device);
      }
      //*** Next refresh the device ***\\
      if ((accessory = this.devicesInHB.get(device.vacuum.did))) {
         this.log("[%s] found in your ECOVACS account.", displayName);
         accessory.deebot = device;
         device.on("ready", event => {
            device.run("GetBatteryState");
            device.run("GetChargeState");
            device.run("GetCleanState");
            if (device.orderToSend) {
               if (this.debug) {
                  this.log("[%s] sending command [%s].", displayName, device.orderToSend);
               }
               if (Array.isArray(device.orderToSend)) {
                  device.run.apply(device, device.orderToSend);
               } else {
                  device.run(device.orderToSend);
               }
               device.orderToSend = undefined;
            }
         });
         device.on("BatteryInfo", newValue => {
            let oldValue = accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.BatteryLevel).value;
            newValue = Math.round(newValue);
            if (newValue > 100) newValue = 100;
            if (newValue < 0) newValue = 0;
            if (oldValue !== newValue) {
               accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.BatteryLevel, newValue);
               accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.StatusLowBattery, newValue < 20);
            }
            if (this.debug) {
               this.log("[%s] battery level updated to from [%s%] to [%s%].", displayName, oldValue, newValue);
            }
         });
         device.on("ChargeState", newStatus => {
            if (this.debug) {
               this.log("[%s] updated ChargeState status is [%s].", displayName, newStatus);
            }
            accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.ChargingState, newStatus === "charging");
            accessory.getService("Go Charge").updateCharacteristic(Characteristic.On, newStatus === "returning");

         });
         device.on("CleanReport", newStatus => {
            if (this.debug) {
               this.log("[%s] updated CleanReport status is [%s].", displayName, newStatus);
            }
            if (newStatus) {
               accessory.getService("Clean").updateCharacteristic(Characteristic.On, newStatus === "auto");
            }

         });
         device.on("message", msg => {
            this.log("[%s] has sent a message - %s", displayName, msg);
         });
         device.on("Error", err => {
            accessory.getService(Service.MotionSensor).getCharacteristic(Characteristic.MotionDetected, true);
            accessory.getService("Clean").updateCharacteristic(Characteristic.On, false);
            accessory.getService("Go Charge").updateCharacteristic(Characteristic.On, false);
            setTimeout(() => {
               accessory.getService(Service.MotionSensor).getCharacteristic(Characteristic.MotionDetected, false);
            }, 10000);
            this.log.warn("[%s] has sent a message - %s.", displayName, err);
         });
         if (!device.is_ready) {
            device.connect_and_wait_until_ready();
         }
      } else {
         this.log.warn("[%s] cannot be initialised as it wasn't found in Homebridge.", displayName);
      }
   }
   addAccessory(device) {
      let displayName = device.vacuum.nick || device.vacuum.did;
      try {
         const accessory = new Accessory(displayName, UUIDGen.generate(displayName).toString());
         accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.SerialNumber, device.vacuum.did)
            .setCharacteristic(Characteristic.Manufacturer, device.vacuum.company)
            .setCharacteristic(Characteristic.Model, device.deviceModel)
            .setCharacteristic(Characteristic.Identify, false);
         accessory.context.ecoDeviceId = device.vacuum.did;
         accessory.addService(Service.Switch, "Clean", "clean");
         accessory.addService(Service.Switch, "Go Charge", "gocharge");
         accessory.addService(Service.MotionSensor);
         accessory.addService(Service.BatteryService);
         this.devicesInHB.set(device.vacuum.did, accessory);
         this.api.registerPlatformAccessories('homebridge-deebot', 'Deebot', [accessory]);
         this.configureAccessory(accessory);
         this.log("[%s] has been added to Homebridge.", displayName);
      } catch (err) {
         this.log.warn("[%s] could not be added as %s.", displayName, err);
      }
   }
   configureAccessory(accessory) {
      if (!this.log) return;
      try {
         accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.BatteryLevel)
            .on("get", callback => {
               if (accessory.deebot.is_ready) {
                  accessory.deebot.run("GetBatteryState");
               } else {
                  accessory.deebot.connect_and_wait_until_ready();
               }
               callback(undefined, accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.BatteryLevel).value);
            });
         accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.ChargingState)
            .on("get", callback => {
               callback(undefined, accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.ChargingState).value);
            });
         accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.StatusLowBattery)
            .on("get", callback => {
               callback(undefined, accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.StatusLowBattery).value);
            });
         accessory.getService("Clean").getCharacteristic(Characteristic.On)
            .on("get", callback => {
               setTimeout(() => {
                  if (accessory.deebot.is_ready) {
                     accessory.deebot.run("GetChargeState");
                     accessory.deebot.run("GetCleanState");
                  } else {
                     accessory.deebot.connect_and_wait_until_ready();
                  }
               }, 2000);
               callback();
            })
            .on("set", (value, callback) => {
               callback();
               setTimeout(() => {
                  accessory.getService("Go Charge").updateCharacteristic(Characteristic.On, false);
                  let order = value ? ["clean", "auto"] : ["Stop"];
                  if (accessory.deebot.is_ready) {
                     accessory.deebot.run.apply(accessory.deebot, order);
                  } else {
                     accessory.deebot.orderToSend = order;
                     accessory.deebot.connect_and_wait_until_ready();
                  }
                  setTimeout(() => {
                     if (accessory.deebot.is_ready) {
                        accessory.deebot.run("GetChargeState");
                        accessory.deebot.run("GetCleanState");
                     } else {
                        accessory.deebot.connect_and_wait_until_ready();
                     }
                  }, 1000);
               }, 1000);
            });
         accessory.getService("Go Charge").getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => {
               callback();
               setTimeout(() => {
                  if (!accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.ChargingState).value) {
                     let order = value ? ["Charge"] : ["Stop"];
                     if (accessory.deebot.is_ready) {
                        accessory.deebot.run.apply(accessory.deebot, order);
                     } else {
                        accessory.deebot.orderToSend = order;
                        accessory.deebot.connect_and_wait_until_ready();
                     }
                     return;
                  }
                  setTimeout(() => {
                     if (accessory.deebot.is_ready) {
                        accessory.deebot.run("GetChargeState");
                     } else {
                        accessory.deebot.connect_and_wait_until_ready();
                     }
                  }, 1000);
               }, 1000);
            });
         accessory.getService(Service.MotionSensor).getCharacteristic(Characteristic.MotionDetected)
            .on("get", callback => callback());
         this.devicesInHB.set(accessory.context.ecoDeviceId, accessory);
      } catch (err) {
         this.log.warn("[%s] could not be refreshed as %s.", accessory.displayName, err);
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