/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const PLUGIN = require('./../package.json')
class DeebotPlatform {
  constructor (log, config, api) {
    if (!log || !api) {
      return
    }
    try {
      if (!config || !config.username || !config.password || !config.countryCode) {
        throw new Error('ECOVACS credentials missing from configuration')
      }
      this.log = log
      this.config = config
      this.api = api
      this.helpers = require('./utils/helpers')
      this.deebot = require('ecovacs-deebot')
      this.S = api.hap.Service
      this.C = api.hap.Characteristic
      this.debug = config.debug
      this.disableDeviceLogging = config.disableDeviceLogging
      this.devicesInHB = new Map()
      this.devicesInEC = new Map()
      this.countryCode = this.config.countryCode.toString().toUpperCase().replace(/[^A-Z]+/g, '')
      if (!this.helpers.validCCodes.includes(this.countryCode)) {
        throw new Error('Invalid ECOVACS country code.')
      }
      this.refreshTime = parseInt(config.refreshTime || config.ref)
      this.refreshTime = isNaN(this.refreshTime) || this.refreshTime < 30
        ? this.helpers.defaults.refreshTime
        : this.refreshTime
      this.lowBattThreshold = parseInt(config.lowBattThreshold)
      this.lowBattThreshold = isNaN(this.lowBattThreshold) || this.lowBattThreshold < 1
        ? this.helpers.defaults.lowBattThreshold
        : this.lowBattThreshold
      this.motionDuration = parseInt(config.motionDuration)
      this.motionDuration = isNaN(this.motionDuration) || this.motionDuration < 1
        ? this.helpers.defaults.motionDuration
        : this.motionDuration
      this.ignoredDevices = (this.config.ignoredDevices || '').replace(/[\s'"]+/g, '').toUpperCase().split(',')
      this.api.on('didFinishLaunching', this.deebotSetup.bind(this))
      this.api.on('shutdown', this.deebotShutdown.bind(this))
    } catch (err) {
      log.warn('*** Disabling plugin [v%s] ***', PLUGIN.version)
      log.warn('*** %s. ***', err.message)
    }
  }

  async deebotSetup () {
    try {
      if (this.config.disablePlugin) {
        this.devicesInHB.forEach(a => this.removeAccessory(a))
        throw new Error('To change this, set disablePlugin to false')
      }
      this.log('Plugin [v%s] initialised. Syncing with ECOVACS...', PLUGIN.version)
      this.ecovacsAPI = new this.deebot.EcoVacsAPI(
        this.deebot.EcoVacsAPI.getDeviceId((require('node-machine-id')).machineIdSync()),
        this.countryCode,
        this.deebot.countries[this.countryCode].continent.toUpperCase()
      )
      await this.ecovacsAPI.connect(
        this.config.username.toString().replace(/[\s]+/g, ''),
        this.deebot.EcoVacsAPI.md5(this.config.password)
      )
      const devices = await this.ecovacsAPI.devices()
      devices.forEach(device => {
        try {
          if (this.ignoredDevices.includes(device.did)) {
            if (this.devicesInHB.has(device.did)) {
              this.removeAccessory(this.devicesInHB.get(device.did))
            }
          } else {
            this.devicesInEC.set(
              device.did,
              this.ecovacsAPI.getVacBot(
                this.ecovacsAPI.uid,
                this.deebot.EcoVacsAPI.REALM,
                this.ecovacsAPI.resource,
                this.ecovacsAPI.user_access_token,
                device,
                this.deebot.countries[this.countryCode].continent.toUpperCase()
              )
            )
          }
        } catch (err) {
          this.log.warn(this.debug ? err : err.message)
        }
      })
      this.devicesInEC.forEach(d => this.initialiseDevice(d))
      this.refreshDevices = setInterval(() => {
        try {
          this.devicesInHB.forEach(a => this.refreshAccessory(a))
        } catch (err) {
          this.log.warn(this.debug ? err : err.message)
        }
      }, this.refreshTime * 1000)
      this.log('✓ Setup complete. %s', this.helpers.logMessages[Math.floor(Math.random() * this.helpers.logMessages.length)])
    } catch (err) {
      this.log.warn('*** Disabling plugin [v%s] ***', PLUGIN.version)
      this.log.warn('*** %s. ***', err.message)
    }
  }

  deebotShutdown () {
    try {
      clearInterval(this.refreshDevices)
      this.devicesInHB.forEach(a => {
        if (a.deebot && a.deebot.is_ready) {
          a.deebot.disconnect()
        }
      })
    } catch (err) {}
  }

  initialiseDevice (device) {
    try {
      const accessory = this.devicesInHB.has(device.vacuum.did)
        ? this.devicesInHB.get(device.vacuum.did)
        : this.addAccessory(device)
      accessory.control = device
      accessory.control.on('ready', event => this.externalReadyUpdate(accessory, event))
      accessory.control.on('CleanReport', newStatus => this.externalCleanUpdate(accessory, newStatus))
      accessory.control.on('BatteryInfo', newValue => this.externalBatteryUpdate(accessory, newValue))
      accessory.control.on('ChargeState', newStatus => this.externalChargeUpdate(accessory, newStatus))
      accessory.control.on('message', msg => this.externalMessageUpdate(accessory, msg))
      accessory.control.on('Error', err => this.externalErrorUpdate(accessory, err))
      if (!accessory.control || !accessory.control.is_ready) {
        accessory.control.connect_and_wait_until_ready()
      }
      accessory.context.deviceId = device.vacuum.did
      this.log('[%s] initialised with id %s.', accessory.displayName, device.vacuum.did)
      this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(device.vacuum.did, accessory)
      this.refreshAccessory(accessory)
    } catch (err) {
      const errToShow = this.debug ? err : err.message
      this.log.warn('[%s] could not be initialised as %s.', device.vacuum.nick || device.vacuum.did, errToShow)
    }
  }

  refreshAccessory (accessory) {
    try {
      if (accessory.control) {
        if (accessory.control.is_ready) {
          accessory.control.run('GetBatteryState')
          accessory.control.run('GetChargeState')
          accessory.control.run('GetCleanState')
        } else {
          accessory.control.connect_and_wait_until_ready()
        }
      }
    } catch (err) {
      this.log.warn('[%s] could not be refreshed as %s.', accessory.displayName, this.debug ? err : err.message)
    }
  }

  addAccessory (device) {
    let displayName
    try {
      displayName = device.vacuum.nick || device.vacuum.did
      const accessory = new this.api.platformAccessory(displayName, this.api.hap.uuid.generate(displayName))
      accessory.getService(this.S.AccessoryInformation)
        .setCharacteristic(this.C.SerialNumber, device.vacuum.did)
        .setCharacteristic(this.C.Manufacturer, device.vacuum.company)
        .setCharacteristic(this.C.Model, device.deviceModel)
        .setCharacteristic(this.C.Identify, true)
      accessory.on('identify', (paired, callback) => {
        callback()
        this.log('[%s] identify button pressed.', accessory.displayName)
      })
      accessory.context.ecoDeviceId = device.vacuum.did
      this.api.registerPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(device.vacuum.did, accessory)
      this.log('[%s] has been added to Homebridge.', displayName)
      this.configureAccessory(accessory)
      return accessory
    } catch (err) {
      this.log.warn('[%s] could not be added to Homebridge as %s.', displayName, err)
    }
  }

  configureAccessory (accessory) {
    if (!this.log) {
      return
    }
    try {
      const cleanService = accessory.getService('Clean') || accessory.addService(this.S.Switch, 'Clean', 'clean')
      const chargeService = accessory.getService('Go Charge') || accessory.addService(this.S.Switch, 'Go Charge', 'gocharge')
      cleanService.getCharacteristic(this.C.On)
        .on('set', (value, callback) => this.internalCleanUpdate(accessory, value, callback))
      chargeService.getCharacteristic(this.C.On)
        .on('set', (value, callback) => this.internalChargeUpdate(accessory, value, callback))
      if (!accessory.getService('Attention')) {
        accessory.addService(this.S.MotionSensor, 'Attention', 'attention')
      }
      accessory.getService('Attention').updateCharacteristic(this.C.MotionDetected, false)
      if (!accessory.getService(this.S.BatteryService)) {
        accessory.addService(this.S.BatteryService)
      }
      if (!accessory.getService('Battery Level') && this.config.showBattHumidity) {
        accessory.addService(this.S.HumiditySensor, 'Battery Level', 'batterylevel')
      }
      if (accessory.getService('Battery Level') && !this.config.showBattHumidity) {
        accessory.removeService(accessory.getService('Battery Level'))
      }
      this.devicesInHB.set(accessory.context.ecoDeviceId, accessory)
    } catch (err) {
      if (this.debug) {
        this.log.warn(err)
      }
    }
  }

  removeAccessory (accessory) {
    try {
      this.api.unregisterPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.delete(accessory.context.hbDeviceId)
      this.log('[%s] has been removed from Homebridge.', accessory.displayName)
    } catch (err) {
      this.log.warn('[%s] could not be removed from Homebridge as %s.', accessory.displayName, err)
    }
  }

  async internalCleanUpdate (accessory, value, callback) {
    try {
      callback()
      await this.helpers.sleep(1000)
      accessory.getService('Go Charge').updateCharacteristic(this.C.On, false)
      const order = value ? ['clean', 'auto'] : ['Stop']
      if (!this.disableDeviceLogging) {
        this.log('[%s] current cleaning state [%s].', accessory.displayName, value ? 'cleaning' : 'stop')
      }
      if (accessory.control) {
        if (accessory.control.is_ready) {
          accessory.control.run.apply(accessory.control, order)
        } else {
          accessory.control.orderToSend = order
          accessory.control.connect_and_wait_until_ready()
        }
      }
    } catch (err) {
      const errToShow = this.debug ? ':\n' + err : ' ' + err.message + '.'
      this.log.warn('[%s] command failed as%s', accessory.displayName, errToShow)
    }
  }

  async internalChargeUpdate (accessory, value, callback) {
    try {
      callback()
      await this.helpers.sleep(1000)
      if (accessory.getService(this.S.BatteryService).getCharacteristic(this.C.ChargingState).value === 0) {
        const order = value ? ['Charge'] : ['Stop']
        if (!this.disableDeviceLogging) {
          this.log('[%s] current charging state [%s].', accessory.displayName, value ? 'returning' : 'stop')
        }
        if (accessory.control) {
          if (accessory.control.is_ready) {
            accessory.control.run.apply(accessory.control, order)
          } else {
            accessory.control.orderToSend = order
            accessory.control.connect_and_wait_until_ready()
          }
        }
      }
    } catch (err) {
      const errToShow = this.debug ? ':\n' + err : ' ' + err.message + '.'
      this.log.warn('[%s] command failed as%s', accessory.displayName, errToShow)
    }
  }

  externalReadyUpdate (accessory, event) {
    try {
      accessory.control.run('GetBatteryState')
      accessory.control.run('GetChargeState')
      accessory.control.run('GetCleanState')
      if (accessory.control) {
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
    } catch (err) {
      const errToShow = this.debug ? ':\n' + err : ' ' + err.message + '.'
      this.log.warn('[%s] update failed as%s', accessory.displayName, errToShow)
    }
  }

  externalCleanUpdate (accessory, newStatus) {
    try {
      if (accessory.cacheClean !== newStatus) {
        accessory.getService('Clean').updateCharacteristic(this.C.On, newStatus === 'auto')
      }
      if (this.debug || (accessory.cacheClean !== newStatus && !this.disableDeviceLogging)) {
        this.log('[%s] current cleaning state [%s].', accessory.displayName, newStatus)
      }
      accessory.cacheClean = newStatus
    } catch (err) {
      const errToShow = this.debug ? ':\n' + err : ' ' + err.message + '.'
      this.log.warn('[%s] update failed as%s', accessory.displayName, errToShow)
    }
  }

  externalChargeUpdate (accessory, newStatus) {
    try {
      if (accessory.cacheCharge !== newStatus) {
        accessory.getService('Go Charge').updateCharacteristic(this.C.On, newStatus === 'returning')
        accessory.getService(this.S.BatteryService)
          .updateCharacteristic(this.C.ChargingState, newStatus === 'charging' ? 1 : 0)
      }
      if (this.debug || (accessory.cacheCharge !== newStatus && !this.disableDeviceLogging)) {
        this.log('[%s] current charging state [%s].', accessory.displayName, newStatus)
      }
      accessory.cacheCharge = newStatus
    } catch (err) {
      const errToShow = this.debug ? ':\n' + err : ' ' + err.message + '.'
      this.log.warn('[%s] update failed as%s', accessory.displayName, errToShow)
    }
  }

  externalBatteryUpdate (accessory, newVal) {
    try {
      newVal = Math.min(Math.max(Math.round(newVal), 0), 100)
      if (accessory.cacheBattery !== newVal) {
        accessory.getService(this.S.BatteryService)
          .updateCharacteristic(this.C.BatteryLevel, newVal)
          .updateCharacteristic(this.C.StatusLowBattery, newVal <= this.lowBattThreshold ? 1 : 0)
        if (this.config.showBattHumidity) {
          accessory.getService('Battery Level').updateCharacteristic(this.C.CurrentRelativeHumidity, newVal)
        }
        if (this.config.showMotionLowBatt && newVal <= this.lowBattThreshold && !accessory.cacheShownMotionLowBatt) {
          this.externalMessageUpdate(accessory, 'Device has low battery - ' + newVal + '%')
          accessory.cacheShownMotionLowBatt = true
        }
        if (newVal > this.lowBattThreshold) {
          accessory.cacheShownMotionLowBatt = false
        }
      }
      if (this.debug || (accessory.cacheBattery !== newVal && !this.disableDeviceLogging)) {
        this.log('[%s] current battery [%s%].', accessory.displayName, newVal)
      }
      accessory.cacheBattery = newVal
    } catch (err) {
      const errToShow = this.debug ? ':\n' + err : ' ' + err.message + '.'
      this.log.warn('[%s] update failed as%s', accessory.displayName, errToShow)
    }
  }

  async externalMessageUpdate (accessory, msg) {
    try {
      if (accessory.cacheInUse || this.helpers.messagesToIgnore.includes(msg)) {
        return
      }
      accessory.cacheInUse = true
      this.log.warn('[%s] sent message [%s].', accessory.displayName, msg)
      accessory.getService('Attention').updateCharacteristic(this.C.MotionDetected, true)
      await this.helpers.sleep(this.motionDuration * 1000)
      accessory.getService('Attention').updateCharacteristic(this.C.MotionDetected, false)
      accessory.cacheInUse = false
    } catch (err) {
      const errToShow = this.debug ? ':\n' + err : ' ' + err.message + '.'
      this.log.warn('[%s] update failed as%s', accessory.displayName, errToShow)
    }
  }

  async externalErrorUpdate (accessory, err) {
    try {
      if (accessory.cacheInUse || this.helpers.messagesToIgnore.includes(err)) {
        return
      }
      accessory.cacheInUse = true
      this.log.warn('[%s] sent error [%s].', accessory.displayName, err)
      accessory.getService('Attention').updateCharacteristic(this.C.MotionDetected, true)
      accessory.getService('Clean').updateCharacteristic(this.C.On, false)
      accessory.getService('Go Charge').updateCharacteristic(this.C.On, false)
      await this.helpers.sleep(this.motionDuration * 1000)
      accessory.getService('Attention').updateCharacteristic(this.C.MotionDetected, false)
      accessory.cacheInUse = false
    } catch (err) {
      const errToShow = this.debug ? ':\n' + err : ' ' + err.message + '.'
      this.log.warn('[%s] update failed as%s', accessory.displayName, errToShow)
    }
  }
}

module.exports = hb => hb.registerPlatform(PLUGIN.alias, DeebotPlatform)
