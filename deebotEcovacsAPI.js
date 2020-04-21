const ecovacsDeebot = require('ecovacs-deebot'),
  nodeMachineId = require('node-machine-id'),
  countries = ecovacsDeebot.countries,
  EcoVacsAPI = ecovacsDeebot.EcoVacsAPI;

var EventEmitter = require('events');
var inherits = require('util').inherits;

module.exports = {
  DeebotEcovacsAPI: DeebotEcovacsAPI,
};

function DeebotEcovacsAPI(log, platform) {
  EventEmitter.call(this);

  this.log = log;
  this.platform = platform;
  this.login = platform.login;
  this.countryCode = platform.countryCode.toUpperCase();
  this.device_id = EcoVacsAPI.md5(nodeMachineId.machineIdSync());
  this.password_hash = EcoVacsAPI.md5(platform.password);
  this.continent = countries[this.countryCode].continent.toUpperCase();

  this.log('INFO - API :' + this.continent + '/' + this.countryCode);

  this.api = new EcoVacsAPI(this.device_id, this.countryCode, this.continent);

  this.vacbots = [];
}

DeebotEcovacsAPI.prototype = {
  getDeebots: function () {
    this.api
      .connect(this.login, this.password_hash)
      .then(() => {
        this.log.debug('INFO - connected');
        this.api.devices().then((devices) => {
          this.log.debug('INFO - getDeebots :', JSON.stringify(devices));

          for (let s = 0; s < devices.length; s++) {
            let vacuum = devices[s]; // Selects the first vacuum from your account

            let vacbot = this.api.getVacBot(
              this.api.uid,
              EcoVacsAPI.REALM,
              this.api.resource,
              this.api.user_access_token,
              vacuum,
              this.continent
            );
            this.vacbots.push(vacbot);
          }
          this.emit('deebotsDiscovered');
        });
      })
      .catch((e) => {
        // The Ecovacs API endpoint is not very stable, so
        // connecting fails randomly from time to time
        this.log('ERROR - Failure in connecting to ecovacs to retrieve your deebots! - ' + e);
        this.emit('errorDiscoveringDeebots');
      });
  },

  configureEvents(vacBot, HKBatteryService, HKFanService, HKSwitchOnService, HKMotionService) {
    var Characteristic = this.platform.api.hap.Characteristic;
    vacBot.on('ready', (event) => {
      this.log.debug('INFO - Vacbot ready: ' + JSON.stringify(event));

      vacBot.run('GetCleanState');
      vacBot.run('GetBatteryState');
      vacBot.run('GetChargeState');
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
      let batteryLevel = this.platform.getBatteryLevel(battery);
      let currentValue = HKBatteryService.getCharacteristic(Characteristic.BatteryLevel).value;

      this.log.debug('INFO - Battery level: %d %d %d', battery, batteryLevel, currentValue);

      if (currentValue !== batteryLevel) {
        HKBatteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(batteryLevel);
        if (batteryLevel < 20)
          HKBatteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(1);
        else HKBatteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(0);
      }
    });

    vacBot.on('ChargeState', (charge_status) => {
      let charging = charge_status == 'charging';
      let idle = charge_status == 'idle';
      let returning = charge_status == 'returning';
      this.log.debug('INFO - Charge status: %s %s %s', charge_status, idle, charging);

      let currentValue = HKBatteryService.getCharacteristic(Characteristic.ChargingState).value;

      if (currentValue !== charging) {
        KBatteryService.getCharacteristic(Characteristic.ChargingState).updateValue(charging);
      }

      let currentMainOnValue = HKSwitchOnService.getCharacteristic(Characteristic.On).value;
      let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;

      if (charging && currentOnValue) {
        HKFanService.getCharacteristic(Characteristic.On).updateValue(false);
      } else if (returning && !currentOnValue) {
        HKFanService.getCharacteristic(Characteristic.On).updateValue(true);
      }

      if (charging && currentMainOnValue) {
        HKSwitchOnService.getCharacteristic(Characteristic.On).updateValue(false);
      } else if (idle && !currentMainOnValue) {
        this.log.debug('INFO - TOTO');
        HKSwitchOnService.getCharacteristic(Characteristic.On).updateValue(true);
      }
    });

    vacBot.on('CleanReport', (clean_status) => {
      this.log.debug('INFO - Clean status: %s', clean_status);

      if (clean_status) {
        let cleaning = clean_status != 'stop' && clean_status != 'pause' && clean_status != 'idle';

        let currentOnValue = HKFanService.getCharacteristic(Characteristic.On).value;
        if (currentOnValue !== cleaning) {
          HKFanService.getCharacteristic(Characteristic.On).updateValue(cleaning);
        }

        let currentDirectionValue = HKFanService.getCharacteristic(Characteristic.RotationDirection)
          .value;
        if (clean_status == 'edge' && currentDirectionValue == 0) {
          HKFanService.getCharacteristic(Characteristic.RotationDirection).updateValue(0);
        } else if (clean_status != 'edge' && currentDirectionValue == 1) {
          HKFanService.getCharacteristic(Characteristic.RotationDirection).updateValue(1);
        }

        let currentMainOnValue = HKSwitchOnService.getCharacteristic(Characteristic.On).value;
        if (cleaning && !currentMainOnValue)
          HKSwitchOnService.getCharacteristic(Characteristic.On).updateValue(true);
      }
    });

    vacBot.on('CleanSpeed', (clean_speed) => {
      let currentSpeedValue = HKFanService.getCharacteristic(Characteristic.RotationSpeed).value;
      let deebotSpeed = this.platform.getCleanSpeed(currentSpeedValue);

      this.log.debug('INFO - Clean speed : %s - %s', clean_speed, deebotSpeed);

      if (deebotSpeed !== clean_speed) {
        let newSpeed = this.platform.getFanSpeed(clean_speed);
        HKFanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(newSpeed);
      }
    });

    vacBot.on('Error', (error_message) => {
      this.log.debug('INFO - Error from deebot : %s ', error_message);

      if (error_message)
        HKMotionService.getCharacteristic(Characteristic.MotionDetected).updateValue(true);
    });

    vacBot.on('message', (message) => {
      this.log.debug('INFO - Message from deebot : %s ', message);
    });

    if (!vacBot.is_ready) vacBot.connect_and_wait_until_ready();
  },
};

inherits(DeebotEcovacsAPI, EventEmitter);
