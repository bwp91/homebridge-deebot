/* jshint esversion: 9, -W030, node: true */
"use strict";
const deebot = require("ecovacs-deebot"),
   eventemitter = require("events"),
   nodeMachineId = require("node-machine-id");
module.exports = class deebotAPI {
   constructor(log, platform) {
      this.log = log;
      this.platform = platform;
      this.debug = platform.config.debug || false;
      this.countryCode = platform.countryCode.toUpperCase();
      this.device_id = deebot.EcoVacsAPI.md5(nodeMachineId.machineIdSync());
      this.continent = deebot.countries[this.countryCode].continent.toUpperCase();
      this.api = new deebot.EcoVacsAPI(this.device_id, this.countryCode, this.continent);
      this.emitter = new eventemitter();
   }
   getDeebots() {
      this.api.connect(this.platform.login, deebot.EcoVacsAPI.md5(this.platform.password))
         .then(() => {
            this.api.devices().then(devices => {
               let deviceList = [];
               devices.forEach(device => deviceList.push(
                  this.api.getVacBot(
                     this.api.uid,
                     deebot.EcoVacsAPI.REALM,
                     this.api.resource,
                     this.api.user_access_token,
                     device,
                     this.continent
                  )
               ));
               this.emitter.emit("discoverSuccess", deviceList);
            });
         })
         .catch(err => this.emitter.emit("discoverFailure", err));
   }
   discoverSuccess(f) {
      this.emitter.addListener("discoverSuccess", f);
   }
   discoverFailure(f) {
      this.emitter.addListener("discoverFailure", f);
   }
   configureEvents(vacBot, HKBatteryService, HKFanService, HKSwitchOnService, HKMotionService, deebotAccessory) {
      let Characteristic = this.platform.api.hap.Characteristic,
         displayName = vacBot.vacuum.nick || vacBot.vacuum.name;
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
         let batteryLevel = this.platform.getBatteryLevel(battery),
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
         if (deebotAccessory.publishFan && HKFanService) {
            let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;
            if (charging && currentOnValue) {
               HKFanService.updateCharacteristic(Characteristic.On, false);
            } else if (returning && !currentOnValue) {
               HKFanService.updateCharacteristic(Characteristic.On, true);
            }
         }
         if (deebotAccessory.publishSwitch && HKSwitchOnService) {
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
            if (deebotAccessory.publishFan && HKFanService) {
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
            if (deebotAccessory.publishSwitch && HKSwitchOnService) {
               let currentMainOnValue = HKSwitchOnService.getCharacteristic(Characteristic.On).value;
               if (cleaning && !currentMainOnValue) {
                  HKSwitchOnService.updateCharacteristic(Characteristic.On, true);
               }
            }
         }
      });
      vacBot.on("CleanSpeed", cleanSpeed => {
         if (deebotAccessory.publishFan && HKFanService) {
            let currentSpeedValue = HKFanService.getCharacteristic(Characteristic.RotationSpeed).value,
               deebotSpeed = this.platform.getCleanSpeed(currentSpeedValue);
            if (this.debug) {
               this.log("[%s] cleaning speed is [%s - %s].", displayName, cleanSpeed, deebotSpeed);
            }
            if (deebotSpeed !== cleanSpeed) {
               HKFanService.updateCharacteristic(Characteristic.RotationSpeed, this.platform.getFanSpeed(cleanSpeed));
            }
         }
      });
      vacBot.on("Error", err => {
         this.log.error("[%s] received an error - %s.", displayName, err);
         if (deebotAccessory.publishMotionDetector && HKMotionService && err) {
            HKMotionService.getCharacteristic(Characteristic.MotionDetected, true);
         }
      });
      vacBot.on("message", msg => this.log("[%s] %s.", displayName, msg));
      if (!vacBot.is_ready) {
         vacBot.connect_and_wait_until_ready();
      }
   }
};