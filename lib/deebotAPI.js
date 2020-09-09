/* jshint esversion: 9, -W030, node: true */
"use strict";
const deebot = require("ecovacs-deebot");
const eventemitter = require("events");
const nodeMachineId = require("node-machine-id");
const util = require("util");
class deebotAPI {
   constructor(log, platform) {
      eventemitter.call(this);
      this.log = log;
      this.platform = platform;
      this.countryCode = platform.countryCode.toUpperCase();
      this.device_id = deebot.EcoVacsAPI.md5(nodeMachineId.machineIdSync());
      this.continent = deebot.countries[this.countryCode].continent.toUpperCase();
      this.api = new deebot.EcoVacsAPI(this.device_id, this.countryCode, this.continent);
      this.vacbots = [];
   }
   getDeebots() {
      this.api
         .connect(this.platform.login, deebot.EcoVacsAPI.md5(this.platform.password))
         .then(() => {
            this.api.devices().then(devices => {
               for (let s = 0; s < devices.length; s++) {
                  let vacuum = devices[s];
                  let vacbot = this.api.getVacBot(
                     this.api.uid,
                     deebot.EcoVacsAPI.REALM,
                     this.api.resource,
                     this.api.user_access_token,
                     vacuum,
                     this.continent
                  );
                  this.vacbots.push(vacbot);
               }
               this.emit("deebotsDiscovered");
            });
         })
         .catch(err => {
            this.log.error("Failure in connecting to ecovacs to retrieve your deebots as %s.", err);
            this.emit("errorDiscoveringDeebots");
         });
   }

   configureEvents(vacBot, HKBatteryService, HKFanService, HKSwitchOnService, HKMotionService, deebotAccessory) {
      let Characteristic = this.platform.api.hap.Characteristic;
      vacBot.on("ready", event => {
         vacBot.run("GetCleanState");
         vacBot.run("GetBatteryState");
         vacBot.run("GetChargeState");
         vacBot.run("GetCleanSpeed");
         if (vacBot.orderToSend && vacBot.orderToSend !== undefined) {
            this.log("INFO - sendingCommand " + vacBot.orderToSend);
            if (vacBot.orderToSend instanceof Array) {
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

         this.log("INFO - Battery level: %d %d %d", battery, batteryLevel, currentValue);

         if (currentValue !== batteryLevel) {
            HKBatteryService.updateCharacteristic(Characteristic.BatteryLevel, batteryLevel);
            HKBatteryService.updateCharacteristic(Characteristic.StatusLowBattery, batteryLevel < 20);
         }
      });

      vacBot.on("ChargeState", charge_status => {
         let charging = charge_status === "charging",
            idle = charge_status === "idle",
            returning = charge_status === "returning",
            currentValue = HKBatteryService.getCharacteristic(Characteristic.ChargingState).value;

         this.log("INFO - Charge status: %s %s %s", charge_status, idle, charging);

         if (currentValue !== charging) {
            HKBatteryService.updateCharacteristic(Characteristic.ChargingState, charging);
         }

         if (deebotAccessory.publishFan && HKFanService) {
            let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;
            if (charging && currentOnValue) {
               HKFanService.getCharacteristic(Characteristic.On).updateValue(false);
            } else if (returning && !currentOnValue) {
               HKFanService.getCharacteristic(Characteristic.On).updateValue(true);
            }
         }

         if (deebotAccessory.publishSwitch && HKSwitchOnService) {
            let currentMainOnValue = HKSwitchOnService.getCharacteristic(Characteristic.On).value;
            if (charging && currentMainOnValue) {
               HKSwitchOnService.getCharacteristic(Characteristic.On).updateValue(false);
            } else if (idle && !currentMainOnValue) {
               HKSwitchOnService.getCharacteristic(Characteristic.On).updateValue(true);
            }
         }
      });

      vacBot.on("CleanReport", clean_status => {
         this.log("INFO - Clean status: %s", clean_status);
         if (clean_status) {
            let cleaning = clean_status !== "stop" && clean_status !== "pause" && clean_status !== "idle";
            if (deebotAccessory.publishFan && HKFanService) {
               let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;
               if (currentOnValue !== cleaning) {
                  HKFanService.getCharacteristic(Characteristic.On).updateValue(cleaning);
               }
               let currentDirectionValue = HKFanService.getCharacteristic(Characteristic.RotationDirection).value;
               if (clean_status === deebotAccessory.leftDirectionCleaningMode && currentDirectionValue === 0) {
                  HKFanService.getCharacteristic(Characteristic.RotationDirection).updateValue(0);
               } else if (clean_status !== deebotAccessory.leftDirectionCleaningMode && currentDirectionValue === 1) {
                  HKFanService.getCharacteristic(Characteristic.RotationDirection).updateValue(1);
               }
            }
            if (deebotAccessory.publishSwitch && HKSwitchOnService) {
               let currentMainOnValue = HKSwitchOnService.getCharacteristic(Characteristic.On).value;
               if (cleaning && !currentMainOnValue) {
                  HKSwitchOnService.getCharacteristic(Characteristic.On).updateValue(true);
               }
            }
         }
      });

      vacBot.on("CleanSpeed", clean_speed => {
         if (deebotAccessory.publishFan && HKFanService) {
            let currentSpeedValue = HKFanService.getCharacteristic(Characteristic.RotationSpeed).value,
               deebotSpeed = this.platform.getCleanSpeed(currentSpeedValue);
            this.log("INFO - Clean speed : %s - %s", clean_speed, deebotSpeed);
            if (deebotSpeed !== clean_speed) {
               HKFanService.updateCharacteristic(Characteristic.RotationSpeed, this.platform.getFanSpeed(clean_speed));
            }
         }
      });

      vacBot.on("Error", error_message => {
         this.log("INFO - Error from deebot : %s ", error_message);
         if (deebotAccessory.publishMotionDetector && HKMotionService) {
            if (error_message) {
               HKMotionService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);
            }
         }
      });

      vacBot.on("message", message => this.log("INFO - Message from deebot : %s ", message));
      if (!vacBot.is_ready) {
         vacBot.connect_and_wait_until_ready();
      }
   }
}
util.inherits(deebotAPI, eventemitter);
module.exports = {
   deebotAPI: deebotAPI
};