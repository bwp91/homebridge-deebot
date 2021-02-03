/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

const PLUGIN = require('./../package.json')

class DeebotPlatform {
  constructor (log, config, api) {
    if (!log || !api) {
      return
    }
    this.consts = require('./utils/constants')
    this.messages = this.consts.messages
    this.funcs = require('./utils/functions')
    try {
      if (!config || !config.username || !config.password || !config.countryCode) {
        throw new Error(this.messages.missingCreds)
      }
      this.log = log
      this.api = api
      this.config = this.consts.defaultConfig
      this.applyUserConfig(config)
      this.devicesInHB = new Map()
      this.devicesInEC = new Map()
      this.hapServ = api.hap.Service
      this.hapChar = api.hap.Characteristic
      this.deebotClient = require('ecovacs-deebot')
      this.api.on('didFinishLaunching', this.pluginSetup.bind(this))
      this.api.on('shutdown', this.pluginShutdown.bind(this))
    } catch (err) {
      const hideErrLines = [this.messages.invalidCCode, this.messages.missingCreds]
      const eText = hideErrLines.includes(err.message)
        ? err.message
        : this.funcs.parseError(err)
      log.warn('***** %s [v%s]. *****', this.messages.disabling, PLUGIN.version)
      log.warn('***** %s. *****', eText)
    }
  }

  applyUserConfig (config) {
    const logIncrease = (key, min) => {
      this.log('%s [%s] %s %s.', this.messages.cfgItem, key, this.messages.cfgLow, min)
    }
    const logRemove = key => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, key, this.messages.cfgRmv)
    }
    for (const [key, val] of Object.entries(config)) {
      switch (key) {
        case 'countryCode':
          this.config.countryCode = val.toString().toUpperCase().replace(/[^A-Z]+/g, '')
          if (!this.consts.validCCodes.includes(this.config.countryCode)) {
            throw new Error(this.messages.invalidCCode)
          }
          break
        case 'debug':
        case 'disableDeviceLogging':
        case 'disablePlugin':
        case 'showBattHumidity':
        case 'showMotionLowBatt':
          this.config[key] = val === 'false' ? false : !!val
          break
        case 'ignoredDevices': {
          let newVal = val
          if (typeof val === 'string' && val.length > 0) {
            newVal = val.split(',')
          }
          if (Array.isArray(newVal) && newVal.length > 0) {
            newVal.forEach(serialNumber => {
              const toAdd = this.funcs.parseSerialNumber(serialNumber)
              this.config.ignoredDevices.push(toAdd)
            })
          }
          break
        }
        case 'lowBattThreshold':
        case 'motionDuration':
        case 'refreshTime': {
          const intVal = parseInt(val)
          if (isNaN(intVal)) {
            this.config[key] = this.consts.defaultValues[key]
          } else if (intVal < this.consts.minValues[key]) {
            logIncrease(key, this.consts.minValues[key])
            this.config[key] = this.consts.minValues[key]
          } else {
            this.config[key] = intVal
          }
          break
        }
        case 'name':
        case 'platform':
          break
        case 'password':
          this.config.password = val.toString()
          break
        case 'username':
          this.config.username = val.toString().replace(/[\s]+/g, '')
          break
        default:
          logRemove(key)
          break
      }
    }
  }

  async pluginSetup () {
    try {
      if (this.config.disablePlugin) {
        this.devicesInHB.forEach(accessory => {
          this.removeAccessory(accessory)
        })
        throw new Error(this.messages.disabled)
      }
      this.log('[v%s] %s.', PLUGIN.version, this.messages.initialised)
      this.ecovacsAPI = new this.deebotClient.EcoVacsAPI(
        this.deebotClient.EcoVacsAPI
          .getDeviceId((require('node-machine-id'))
            .machineIdSync()),
        this.config.countryCode,
        this.deebotClient.countries[this.config.countryCode].continent
      )
      await this.ecovacsAPI.connect(
        this.config.username,
        this.deebotClient.EcoVacsAPI.md5(this.config.password)
      )
      const devices = await this.ecovacsAPI.devices()
      devices.forEach(device => {
        this.initialiseDevice(device)
      })
      this.refreshDevices = setInterval(
        () => {
          this.devicesInHB.forEach(accessory => {
            this.refreshAccessory(accessory)
          })
        },
        this.config.refreshTime * 1000
      )
      const randIndex = Math.floor(Math.random() * this.consts.welcomeMessages.length)
      this.log('%s. %s', this.messages.complete, this.consts.welcomeMessages[randIndex])
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('***** %s [v%s]. *****', this.messages.disabling, PLUGIN.version)
      this.log.warn('***** %s. *****', eText)
      this.pluginShutdown()
    }
  }

  pluginShutdown () {
    try {
      if (this.refreshDevices) {
        clearInterval(this.refreshDevices)
      }
      this.devicesInHB.forEach(accessory => {
        if (accessory.control && accessory.control.is_ready) {
          accessory.control.disconnect()
        }
      })
    } catch (err) {}
  }

  initialiseDevice (device) {
    try {
      if (this.config.ignoredDevices.includes(device.did)) {
        if (this.devicesInHB.has(device.did)) {
          this.removeAccessory(this.devicesInHB.get(device.did))
        }
        return
      }
      const loadedDevice = this.ecovacsAPI.getVacBot(
        this.ecovacsAPI.uid,
        this.deebotClient.EcoVacsAPI.REALM,
        this.ecovacsAPI.resource,
        this.ecovacsAPI.user_access_token,
        device,
        this.deebotClient.countries[this.config.countryCode].continent
      )
      const accessory = this.devicesInHB.has(device.did)
        ? this.devicesInHB.get(device.did)
        : this.addAccessory(loadedDevice)
      if (!accessory) {
        return
      }
      const cleanService = accessory.getService('Clean') ||
        accessory.addService(this.hapServ.Switch, 'Clean', 'clean')
      const chargeService = accessory.getService('Go Charge') ||
        accessory.addService(this.hapServ.Switch, 'Go Charge', 'gocharge')
      cleanService.getCharacteristic(this.hapChar.On)
        .on('set', (value, callback) => {
          this.internalCleanUpdate(accessory, value, callback)
        })
      chargeService.getCharacteristic(this.hapChar.On)
        .on('set', (value, callback) => {
          this.internalChargeUpdate(accessory, value, callback)
        })
      if (!accessory.getService('Attention')) {
        accessory.addService(this.hapServ.MotionSensor, 'Attention', 'attention')
      }
      accessory.getService('Attention')
        .updateCharacteristic(this.hapChar.MotionDetected, false)
      if (!accessory.getService(this.hapServ.BatteryService)) {
        accessory.addService(this.hapServ.BatteryService)
      }
      if (!accessory.getService('Battery Level') && this.config.showBattHumidity) {
        accessory.addService(this.hapServ.HumiditySensor, 'Battery Level', 'batterylevel')
      }
      if (accessory.getService('Battery Level') && !this.config.showBattHumidity) {
        accessory.removeService(accessory.getService('Battery Level'))
      }
      accessory.control = loadedDevice
      accessory.control.on('ready', event => {
        this.externalReadyUpdate(accessory, event)
      })
      accessory.control.on('CleanReport', newStatus => {
        this.externalCleanUpdate(accessory, newStatus)
      })
      accessory.control.on('BatteryInfo', newValue => {
        this.externalBatteryUpdate(accessory, newValue)
      })
      accessory.control.on('ChargeState', newStatus => {
        this.externalChargeUpdate(accessory, newStatus)
      })
      accessory.control.on('message', msg => {
        this.externalMessageUpdate(accessory, msg)
      })
      accessory.control.on('Error', err => {
        this.externalErrorUpdate(accessory, err)
      })
      if (!accessory.control || !accessory.control.is_ready) {
        accessory.control.connect_and_wait_until_ready()
      }
      this.log('[%s] %s %s.', accessory.displayName, this.messages.devInit, device.did)
      this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(device.did, accessory)
      this.refreshAccessory(accessory)
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', device.deviceName, this.messages.devNotInit, eText)
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
      const eText = this.funcs.parseError(err)
      this.log.warn(
        '[%s] %s %s.',
        accessory.displayName,
        this.messages.devNotRefreshed,
        eText
      )
    }
  }

  addAccessory (device) {
    let displayName
    try {
      displayName = device.vacuum.nick || device.vacuum.did
      const uuid = this.api.hap.uuid.generate(device.device)
      const accessory = new this.api.platformAccessory(displayName, uuid)
      accessory.getService(this.hapServ.AccessoryInformation)
        .setCharacteristic(this.hapChar.SerialNumber, device.vacuum.did)
        .setCharacteristic(this.hapChar.Manufacturer, device.vacuum.company)
        .setCharacteristic(this.hapChar.Model, device.deviceModel)
        .setCharacteristic(this.hapChar.Identify, true)
      accessory.on('identify', (paired, callback) => {
        callback()
        this.log('[%s] %s.', accessory.displayName, this.messages.identify)
      })
      accessory.context.ecoDeviceId = device.vacuum.did
      this.api.registerPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(device.vacuum.did, accessory)
      this.log('[%s] %s.', displayName, this.messages.devAdd)
      this.configureAccessory(accessory)
      return accessory
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', displayName, this.messages.devNotAdd, eText)
    }
  }

  configureAccessory (accessory) {
    if (!this.log) {
      return
    }
    try {
      this.devicesInHB.set(accessory.context.ecoDeviceId, accessory)
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.devNotConf, eText)
    }
  }

  removeAccessory (accessory) {
    try {
      this.api.unregisterPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.delete(accessory.context.hbDeviceId)
      this.log('[%s] %s.', accessory.displayName, this.messages.devRemove)
    } catch (err) {
      const eText = this.funcs.parseError(err)
      const name = accessory.displayName
      this.log.warn('[%s] %s %s.', name, this.messages.devNotRemove, eText)
    }
  }

  async internalCleanUpdate (accessory, value, callback) {
    try {
      callback()
      await this.funcs.sleep(1000)
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false)
      const order = value ? ['clean', 'auto'] : ['Stop']
      if (!this.config.disableDeviceLogging) {
        this.log(
          '[%s] %s [%s].',
          accessory.displayName,
          this.messages.curCleaning,
          value ? this.messages.cleaning : this.messages.stop
        )
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
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.cleanFail, eText)
    }
  }

  async internalChargeUpdate (accessory, value, callback) {
    try {
      callback()
      await this.funcs.sleep(1000)
      const battService = accessory.getService(this.hapServ.BatteryService)
      if (battService.getCharacteristic(this.hapChar.ChargingState).value === 0) {
        const order = value ? ['Charge'] : ['Stop']
        if (!this.config.disableDeviceLogging) {
          this.log(
            '[%s] %s [%s].',
            accessory.displayName,
            this.messages.curCharging,
            value ? this.messages.returning : this.messages.stop
          )
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
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.chargeFail, eText)
    }
  }

  externalReadyUpdate (accessory, event) {
    try {
      accessory.control.run('GetBatteryState')
      accessory.control.run('GetChargeState')
      accessory.control.run('GetCleanState')
      if (accessory.control) {
        if (accessory.control.orderToSend) {
          if (this.config.debug) {
            this.log(
              '[%s] %s [%s].',
              accessory.displayName,
              this.messages.sendingCommand,
              accessory.control.orderToSend
            )
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
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inRdyFail, eText)
    }
  }

  externalCleanUpdate (accessory, newStatus) {
    try {
      if (accessory.cacheClean !== newStatus) {
        accessory.getService('Clean')
          .updateCharacteristic(this.hapChar.On, newStatus === 'auto')
      }
      if (
        this.config.debug ||
        (accessory.cacheClean !== newStatus && !this.config.disableDeviceLogging)
      ) {
        this.log(
          '[%s] %s [%s].',
          accessory.displayName,
          this.messages.curCleaning,
          newStatus
        )
      }
      accessory.cacheClean = newStatus
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inClnFail, eText)
    }
  }

  externalChargeUpdate (accessory, newStatus) {
    try {
      if (accessory.cacheCharge !== newStatus) {
        accessory.getService('Go Charge')
          .updateCharacteristic(this.hapChar.On, newStatus === 'returning')
        const chargeState = newStatus === 'charging' ? 1 : 0
        accessory.getService(this.hapServ.BatteryService)
          .updateCharacteristic(this.hapChar.ChargingState, chargeState)
      }
      if (
        this.config.debug ||
        (accessory.cacheCharge !== newStatus && !this.config.disableDeviceLogging)
      ) {
        this.log(
          '[%s] %s [%s].',
          accessory.displayName,
          this.messages.curCharging,
          newStatus
        )
      }
      accessory.cacheCharge = newStatus
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inChgFail, eText)
    }
  }

  externalBatteryUpdate (accessory, newVal) {
    try {
      newVal = Math.min(Math.max(Math.round(newVal), 0), 100)
      if (accessory.cacheBattery !== newVal) {
        const lowBattStatus = newVal <= this.config.lowBattThreshold ? 1 : 0
        accessory.getService(this.hapServ.BatteryService)
          .updateCharacteristic(this.hapChar.BatteryLevel, newVal)
          .updateCharacteristic(this.hapChar.StatusLowBattery, lowBattStatus)
        if (this.config.showBattHumidity) {
          accessory.getService('Battery Level')
            .updateCharacteristic(this.hapChar.CurrentRelativeHumidity, newVal)
        }
        if (
          this.config.showMotionLowBatt &&
          newVal <= this.config.lowBattThreshold &&
          !accessory.cacheShownMotionLowBatt
        ) {
          this.externalMessageUpdate(accessory, this.messages.lowBattMsg + newVal + '%')
          accessory.cacheShownMotionLowBatt = true
        }
        if (newVal > this.config.lowBattThreshold) {
          accessory.cacheShownMotionLowBatt = false
        }
      }
      if (
        this.config.debug ||
        (accessory.cacheBattery !== newVal && !this.config.disableDeviceLogging)
      ) {
        this.log('[%s] %s [%s%].', accessory.displayName, this.messages.curBatt, newVal)
      }
      accessory.cacheBattery = newVal
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inBattFail, eText)
    }
  }

  async externalMessageUpdate (accessory, msg) {
    try {
      if (accessory.cacheInUse || this.consts.messagesToIgnore.includes(msg)) {
        return
      }
      accessory.cacheInUse = true
      this.log.warn('[%s] %s [%s].', accessory.displayName, this.messages.sentMsg, msg)
      accessory.getService('Attention')
        .updateCharacteristic(this.hapChar.MotionDetected, true)
      await this.funcs.sleep(this.config.motionDuration * 1000)
      accessory.getService('Attention')
        .updateCharacteristic(this.hapChar.MotionDetected, false)
      accessory.cacheInUse = false
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inMsgFail, eText)
    }
  }

  async externalErrorUpdate (accessory, err) {
    try {
      if (accessory.cacheInUse || this.consts.messagesToIgnore.includes(err)) {
        return
      }
      accessory.cacheInUse = true
      this.log.warn('[%s] %s [%s].', accessory.displayName, this.messages.sentErr, err)
      accessory.getService('Attention')
        .updateCharacteristic(this.hapChar.MotionDetected, true)
      accessory.getService('Clean').updateCharacteristic(this.hapChar.On, false)
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false)
      await this.funcs.sleep(this.config.motionDuration * 1000)
      accessory.getService('Attention')
        .updateCharacteristic(this.hapChar.MotionDetected, false)
      accessory.cacheInUse = false
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inErrFail, eText)
    }
  }
}

module.exports = hb => hb.registerPlatform(PLUGIN.alias, DeebotPlatform)
