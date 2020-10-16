/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const deebot = require('ecovacs-deebot')
const nodeMachineId = require('node-machine-id')
const promInterval = require('interval-promise')
const helpers = require('./helpers')
module.exports = class deebotPlatform {
  constructor (log, config, api) {
    if (!log || !api || !config) return
    if (!config.username || !config.password || !config.countryCode) {
      log.error('**************** Cannot load homebridge-deebot *****************')
      log.error('Your ECOVACS credentials are missing from the Homebridge config.')
      log.error('****************************************************************')
      return
    }
    this.log = log
    this.config = config
    this.api = api
    this.Service = api.hap.Service
    this.Characteristic = api.hap.Characteristic
    this.debug = this.config.debug
    this.devicesInHB = new Map()
    this.devicesInEC = new Map()
    this.refreshFlag = true
    this.refreshInterval = this.config.ref >= 30 && this.config.ref <= 600 ? this.config.ref * 1000 : 120000
    this.ecovacsAPI = new deebot.EcoVacsAPI(
      deebot.EcoVacsAPI.md5(nodeMachineId.machineIdSync()),
      this.config.countryCode,
      deebot.countries[this.config.countryCode].continent.toUpperCase()
    )
    this.api
      .on('didFinishLaunching', () => this.deebotSetup())
      .on('shutdown', () => this.deebotShutdown())
  }

  async deebotSetup () {
    if (this.config.disablePlugin) {
      this.devicesInHB.forEach(a => this.removeAccessory(a))
      this.log.warn('********* Not loading homebridge-deebot **********')
      this.log.warn('*** To change this, set disablePlugin to false ***')
      this.log.warn('**************************************************')
      return
    }
    this.log('Plugin has finished initialising. Starting synchronisation with ECOVACS account.')
    try {
      await this.ecovacsAPI.connect(this.config.username, deebot.EcoVacsAPI.md5(this.config.password))
    } catch (err) {
      this.log.warn('Could not connect to ECOVACS as %s', this.debug ? err : err.message)
      return
    }
    try {
      const devices = await this.ecovacsAPI.devices()
      devices.forEach(device => {
        this.devicesInEC.set(
          device.did,
          this.ecovacsAPI.getVacBot(
            this.ecovacsAPI.uid,
            deebot.EcoVacsAPI.REALM,
            this.ecovacsAPI.resource,
            this.ecovacsAPI.user_access_token,
            device,
            deebot.countries[this.config.countryCode].continent.toUpperCase()
          )
        )
      })
      this.devicesInEC.forEach(d => this.initialiseDevice(d))
    } catch (err) {
      this.log.warn('Could not retrieve devices as %s', this.debug ? err : err.message)
    }
    this.log('[%s] devices loaded from your ECOVACS account.', this.devicesInEC.size)
    this.refreshDevices = promInterval(
      async () => {
        if (!this.refreshFlag) return
        try {
          this.devicesInHB.forEach(a => this.refreshAccessory(a))
        } catch (err) {
          this.log.warn(this.debug ? err : err.message)
        }
      },
      this.refreshInterval,
      { stopOnError: false }
    )
    this.log("ECOVACS sync complete. Don't forget to ⭐️  this plugin on GitHub if you're finding it useful!")
  }

  deebotShutdown () {
    this.refreshFlag = false
    this.devicesInHB.forEach(a => {
      if (a.deebot && a.deebot.is_ready) a.deebot.disconnect()
    })
  }

  initialiseDevice (device) {
    try {
      const accessory = this.devicesInHB.has(device.vacuum.did)
        ? this.devicesInHB.get(device.vacuum.did)
        : this.addAccessory(device)
      accessory.control = device
      accessory.control.on('ready', event => this.externalReadyUpdate(accessory, event))
      accessory.control.on('BatteryInfo', newValue => this.externalBatteryUpdate(accessory, newValue))
      accessory.control.on('ChargeState', newStatus => this.externalChargeUpdate(accessory, newStatus))
      accessory.control.on('CleanReport', newStatus => this.externalCleanUpdate(accessory, newStatus))
      accessory.control.on('message', msg => this.externalMessageUpdate(accessory, msg))
      accessory.control.on('Error', err => this.externalErrorUpdate(accessory, err))
      if (!accessory.control.is_ready) accessory.control.connect_and_wait_until_ready()
      this.refreshAccessory(accessory)
    } catch (err) {
      this.log.warn('[%s] could not be initialised as .', device.vacuum.nick || device.vacuum.did, this.debug ? err : err.message)
    }
  }

  refreshAccessory (accessory) {
    try {
      if (accessory.control.is_ready) {
        accessory.control.run('GetBatteryState')
        accessory.control.run('GetChargeState')
        accessory.control.run('GetCleanState')
      } else {
        accessory.control.connect_and_wait_until_ready()
      }
    } catch (err) {
      this.log.warn('[%s] could not be refreshed as .', accessory.displayName, this.debug ? err : err.message)
    }
  }

  addAccessory (device) {
    const displayName = device.vacuum.nick || device.vacuum.did
    try {
      const accessory = new this.api.platformAccessory(displayName, this.api.hap.uuid.generate(displayName).toString())
      accessory
        .getService(this.Service.AccessoryInformation)
        .setCharacteristic(this.Characteristic.SerialNumber, device.vacuum.did)
        .setCharacteristic(this.Characteristic.Manufacturer, device.vacuum.company)
        .setCharacteristic(this.Characteristic.Model, device.deviceModel)
        .setCharacteristic(this.Characteristic.Identify, true)
      accessory.on('identify', (paired, callback) => {
        this.log('[%s] - identify button pressed.', accessory.displayName)
        callback()
      })
      accessory.context.ecoDeviceId = device.vacuum.did
      this.devicesInHB.set(device.vacuum.did, accessory)
      this.api.registerPlatformAccessories('homebridge-deebot', 'Deebot', [accessory])
      this.log(' → [%s] has been added to Homebridge.', displayName)
      this.configureAccessory(accessory)
      return accessory
    } catch (err) {
      this.log.warn(' → [%s] could not be added as %s.', displayName, err)
    }
  }

  configureAccessory (accessory) {
    if (!this.log) return
    try {
      const cleanService = accessory.getService('Clean') || accessory.addService(this.Service.Switch, 'Clean', 'clean')
      const chargeService = accessory.getService('Go Charge') || accessory.addService(this.Service.Switch, 'Go Charge', 'gocharge')
      cleanService
        .getCharacteristic(this.Characteristic.On)
        .on('set', (value, callback) => this.internalCleanUpdate(accessory, value, callback))
      chargeService
        .getCharacteristic(this.Characteristic.On)
        .on('set', (value, callback) => this.internalChargeUpdate(accessory, value, callback))
      if (!accessory.getService('Attention')) {
        accessory.addService(this.Service.MotionSensor, 'Attention', 'attention')
      }
      if (!accessory.getService(this.Service.BatteryService)) {
        accessory.addService(this.Service.BatteryService)
      }
      if (!accessory.getService('Battery Level') && !this.config.hideBattHumidity) {
        accessory.addService(this.Service.HumiditySensor, 'Battery Level', 'batterylevel')
      }
      if (accessory.getService('Battery Level') && this.config.hideBattHumidity) {
        accessory.removeService(accessory.getService('Battery Level'))
      }
      this.devicesInHB.set(accessory.context.ecoDeviceId, accessory)
    } catch (err) {
      if (this.debug) this.log.warn(err)
    }
  }

  removeAccessory (accessory) {
    try {
      this.api.unregisterPlatformAccessories('homebridge-deebot', 'eWeLink', [accessory])
      this.devicesInHB.delete(accessory.context.hbDeviceId)
      this.log(' → [%s] was removed from Homebridge.', accessory.displayName)
    } catch (err) {
      this.log.warn(" → [%s] wasn't removed as %s.", accessory.displayName, err)
    }
  }

  async internalCleanUpdate (accessory, value, callback) {
    callback()
    await helpers.sleep(1000)
    accessory.getService('Go Charge').updateCharacteristic(this.Characteristic.On, false)
    const order = value ? ['clean', 'auto'] : ['Stop']
    if (accessory.control) {
      if (accessory.control.is_ready) {
        accessory.control.run.apply(accessory.control, order)
      } else {
        accessory.control.orderToSend = order
        accessory.control.connect_and_wait_until_ready()
      }
    }
    await helpers.sleep(2000)
    if (accessory.control) {
      if (accessory.control.is_ready) {
        accessory.control.run('GetChargeState')
        accessory.control.run('GetCleanState')
      } else {
        accessory.control.connect_and_wait_until_ready()
      }
    }
  }

  async internalChargeUpdate (accessory, value, callback) {
    callback()
    await helpers.sleep(1000)
    if (!accessory.getService(this.Service.BatteryService).getCharacteristic(this.Characteristic.ChargingState).value) {
      const order = value ? ['Charge'] : ['Stop']
      if (accessory.control) {
        if (accessory.control.is_ready) {
          accessory.control.run.apply(accessory.control, order)
        } else {
          accessory.control.orderToSend = order
          accessory.control.connect_and_wait_until_ready()
        }
      }
      return
    }
    await helpers.sleep(2000)
    if (accessory.control) {
      if (accessory.control.is_ready) {
        accessory.control.run('GetChargeState')
      } else {
        accessory.control.connect_and_wait_until_ready()
      }
    }
  }

  externalReadyUpdate (accessory, event) {
    accessory.control.run('GetBatteryState')
    accessory.control.run('GetChargeState')
    accessory.control.run('GetCleanState')
    if (accessory.control.orderToSend) {
      if (this.debug) {
        this.log('[%s] sending command [%s].', accessory.displayName, accessory.control.orderToSend)
      }
      if (Array.isArray(accessory.control.orderToSend)) {
        accessory.control.run.apply(accessory.control, accessory.control.orderToSend)
      } else {
        accessory.control.run(accessory.control.orderToSend)
      }
      accessory.control.orderToSend = undefined
    }
  }

  externalBatteryUpdate (accessory, newValue) {
    const oldValue = accessory.getService(this.Service.BatteryService).getCharacteristic(this.Characteristic.BatteryLevel).value
    newValue = Math.round(newValue)
    if (newValue > 100) newValue = 100
    if (newValue < 0) newValue = 0
    if (oldValue !== newValue) {
      accessory.getService(this.Service.BatteryService).updateCharacteristic(this.Characteristic.BatteryLevel, newValue)
      accessory.getService(this.Service.BatteryService).updateCharacteristic(this.Characteristic.StatusLowBattery, newValue < 20)
      if (!this.config.hideBattHumidity) {
        accessory.getService('Battery Level').updateCharacteristic(this.Characteristic.CurrentRelativeHumidity, newValue)
      }
    }
    if (this.debug) {
      this.log('[%s] battery level updated to from [%s%] to [%s%].', accessory.displayName, oldValue, newValue)
    }
  }

  externalChargeUpdate (accessory, newStatus) {
    if (this.debug) {
      this.log('[%s] updated ChargeState status is [%s].', accessory.displayName, newStatus)
    }
    accessory.getService(this.Service.BatteryService).updateCharacteristic(this.Characteristic.ChargingState, newStatus === 'charging')
    accessory.getService('Go Charge').updateCharacteristic(this.Characteristic.On, newStatus === 'returning')
  }

  externalCleanUpdate (accessory, newStatus) {
    if (this.debug) {
      this.log('[%s] updated CleanReport status is [%s].', accessory.displayName, newStatus)
    }
    if (newStatus) {
      accessory.getService('Clean').updateCharacteristic(this.Characteristic.On, newStatus === 'auto')
    }
  }

  async externalMessageUpdate (accessory, msg) {
    if (accessory.context.inUse) return
    accessory.context.inUse = true
    this.log.warn('[%s] has sent a message - %s', accessory.displayName, msg)
    accessory.getService('Attention').getCharacteristic(this.Characteristic.MotionDetected, true)
    await helpers.sleep(10000)
    accessory.getService('Attention').getCharacteristic(this.Characteristic.MotionDetected, false)
    accessory.context.inUse = false
  }

  async externalErrorUpdate (accessory, err) {
    if (accessory.context.inUse) return
    accessory.context.inUse = true
    this.log.warn('[%s] has sent an error message - %s.', accessory.displayName, err)
    accessory.getService('Attention').getCharacteristic(this.Characteristic.MotionDetected, true)
    accessory.getService('Clean').updateCharacteristic(this.Characteristic.On, false)
    accessory.getService('Go Charge').updateCharacteristic(this.Characteristic.On, false)
    await helpers.sleep(10000)
    accessory.getService('Attention').getCharacteristic(this.Characteristic.MotionDetected, false)
    accessory.context.inUse = false
  }
}
