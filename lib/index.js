/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

// Retrieve necessary fields from the package.json file
const PLUGIN = require('./../package.json')

// Create the platform class
class DeebotPlatform {
  constructor (log, config, api) {
    // Don't load the plugin if these aren't accessible for any reason
    if (!log || !api) {
      return
    }

    // Retrieve the necessary constants and functions before starting
    this.consts = require('./utils/constants')
    this.messages = this.consts.messages
    this.funcs = require('./utils/functions')

    // Begin plugin initialisation
    try {
      // Check the user has configured the plugin
      if (!config || !config.username || !config.password || !config.countryCode) {
        throw new Error(this.messages.missingCreds)
      }

      // Initialise these variables before anything else
      this.log = log
      this.api = api

      // Apply the user's configuration
      this.config = this.consts.defaultConfig
      this.applyUserConfig(config)

      // Create further variables needed by the plugin
      this.devicesInHB = new Map()
      this.devicesInEC = new Map()
      this.hapServ = api.hap.Service
      this.hapChar = api.hap.Characteristic

      // Setup the Homebridge events
      this.api.on('didFinishLaunching', this.pluginSetup.bind(this))
      this.api.on('shutdown', this.pluginShutdown.bind(this))
    } catch (err) {
      // Catch any errors during initialisation
      const hideErrLines = [
        this.messages.invalidCCode,
        this.messages.invalidPassword,
        this.messages.invalidUsername,
        this.messages.missingCreds
      ]
      const eText = hideErrLines.includes(err.message)
        ? err.message
        : this.funcs.parseError(err)
      log.warn('***** %s [v%s]. *****', this.messages.disabling, PLUGIN.version)
      log.warn('***** %s. *****', eText)
    }
  }

  applyUserConfig (config) {
    // These shorthand functions save line space during config parsing
    const logDefault = (key, def) => {
      this.log.warn('%s [%s] %s %s.', this.messages.cfgItem, key, this.messages.cfgDef, def)
    }
    const logIgnore = key => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, key, this.messages.cfgIgn)
    }
    const logIncrease = (key, min) => {
      this.log.warn('%s [%s] %s %s.', this.messages.cfgItem, key, this.messages.cfgLow, min)
    }
    const logQuotes = key => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, key, this.messages.cfgQts)
    }
    const logRemove = key => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, key, this.messages.cfgRmv)
    }

    // Begin applying the user's config
    for (const [key, val] of Object.entries(config)) {
      switch (key) {
        case 'countryCode':
          if (typeof val !== 'string' || val === '') {
            throw new Error(this.messages.invalidCCode)
          }
          this.config.countryCode = val.toUpperCase().replace(/[^A-Z]+/g, '')
          if (!this.consts.validCCodes.includes(this.config.countryCode)) {
            throw new Error(this.messages.invalidCCode)
          }
          break
        case 'debug':
        case 'disableDeviceLogging':
        case 'disablePlugin':
        case 'showBattHumidity':
        case 'showMotionLowBatt':
          if (typeof val === 'string') {
            logQuotes(key)
          }
          this.config[key] = val === 'false' ? false : !!val
          break
        case 'ignoredDevices': {
          if (Array.isArray(val)) {
            if (val.length > 0) {
              val.forEach(serialNumber => {
                this.config.ignoredDevices.push(
                  serialNumber.toString().replace(/[\s'"]+/g, '').toUpperCase()
                )
              })
            } else {
              logRemove(key)
            }
          } else {
            logIgnore(key)
          }
          break
        }
        case 'lowBattThreshold':
        case 'motionDuration':
        case 'refreshTime': {
          if (typeof val === 'string') {
            logQuotes(key)
          }
          const intVal = parseInt(val)
          if (isNaN(intVal)) {
            logDefault(key, this.consts.defaultValues[key])
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
          if (typeof val !== 'string' || val === '') {
            throw new Error(this.messages.invalidPassword)
          }
          this.config.password = val
          break
        case 'username':
          if (typeof val !== 'string' || val === '') {
            throw new Error(this.messages.invalidUsername)
          }
          this.config.username = val.replace(/[\s]+/g, '')
          break
        default:
          logRemove(key)
          break
      }
    }
  }

  async pluginSetup () {
    // Plugin has finished initialising to now onto setup
    try {
      // If the user has disabled the plugin then remove all accessories
      if (this.config.disablePlugin) {
        this.devicesInHB.forEach(accessory => {
          this.removeAccessory(accessory)
        })
        throw new Error(this.messages.disabled)
      }

      // Log that the plugin initialisation has been successful
      this.log('[v%s] %s.', PLUGIN.version, this.messages.initialised)

      // Require any libraries that the plugin uses
      this.deebotClient = require('ecovacs-deebot')

      // Connect to ECOVACS
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

      // Get a device list from ECOVACS
      const deviceList = await this.ecovacsAPI.devices()

      // Check the request for device list was successful
      if (!Array.isArray(deviceList)) {
        throw new Error(this.messages.deviceListFail)
      }

      // Initialise each device into Homebridge
      deviceList.forEach(device => {
        this.initialiseDevice(device)
      })

      // Start the polling interval for device state refresh
      this.refreshInterval = setInterval(
        () => {
          this.devicesInHB.forEach(accessory => {
            this.refreshAccessory(accessory)
          })
        },
        this.config.refreshTime * 1000
      )

      // Log that the plugin setup has been successful with a welcome message
      const randIndex = Math.floor(Math.random() * this.consts.welcomeMessages.length)
      this.log('%s. %s', this.messages.complete, this.consts.welcomeMessages[randIndex])
    } catch (err) {
      // Catch any errors during setup
      const eText = this.funcs.parseError(err)
      this.log.warn('***** %s [v%s]. *****', this.messages.disabling, PLUGIN.version)
      this.log.warn('***** %s. *****', eText)
      this.pluginShutdown()
    }
  }

  pluginShutdown () {
    // A function that is called when the plugin fails to load or Homebridge restarts
    try {
      // Stop the refresh interval
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval)
      }

      // Disconnect from each ECOVACS device
      this.devicesInHB.forEach(accessory => {
        if (accessory.control && accessory.control.is_ready) {
          accessory.control.disconnect()
        }
      })
    } catch (err) {
      // No need to show errors at this point
    }
  }

  initialiseDevice (device) {
    try {
      // If the accessory is in the ignored devices list then remove it
      if (this.config.ignoredDevices.includes(device.did)) {
        if (this.devicesInHB.has(device.did)) {
          this.removeAccessory(this.devicesInHB.get(device.did))
        }
        return
      }

      // Load the device control information from ECOVACS
      const loadedDevice = this.ecovacsAPI.getVacBot(
        this.ecovacsAPI.uid,
        this.deebotClient.EcoVacsAPI.REALM,
        this.ecovacsAPI.resource,
        this.ecovacsAPI.user_access_token,
        device,
        this.deebotClient.countries[this.config.countryCode].continent
      )

      // Get the cached accessory or add to Homebridge if doesn't exist
      const accessory = this.devicesInHB.has(device.did)
        ? this.devicesInHB.get(device.did)
        : this.addAccessory(loadedDevice)

      // Final check the accessory now exists in Homebridge
      if (!accessory) {
        throw new Error(this.messages.accNotFound)
      }

      // Add the 'clean' switch service if it doesn't already exist
      const cleanService = accessory.getService('Clean') ||
        accessory.addService(this.hapServ.Switch, 'Clean', 'clean')

      // Add the 'charge' switch service if it doesn't already exist
      const chargeService = accessory.getService('Go Charge') ||
        accessory.addService(this.hapServ.Switch, 'Go Charge', 'gocharge')

      // Add the set handler to the 'clean' switch on/off characteristic
      cleanService.getCharacteristic(this.hapChar.On)
        .on('set', (value, callback) => {
          this.internalCleanUpdate(accessory, value, callback)
        })

      // Add the set handler to the 'charge' switch on/off characteristic
      chargeService.getCharacteristic(this.hapChar.On)
        .on('set', (value, callback) => {
          this.internalChargeUpdate(accessory, value, callback)
        })

      // Add the 'attention' motion service if it doesn't already exist
      if (!accessory.getService('Attention')) {
        accessory.addService(this.hapServ.MotionSensor, 'Attention', 'attention')
      }

      // Set the motion sensor off when the plugin initially loads
      accessory.getService('Attention')
        .updateCharacteristic(this.hapChar.MotionDetected, false)

      // Add the battery service if it doesn't already exist
      if (!accessory.getService(this.hapServ.BatteryService)) {
        accessory.addService(this.hapServ.BatteryService)
      }

      // Add the 'battery' humidity service if it doesn't already exist and user wants it
      if (!accessory.getService('Battery Level') && this.config.showBattHumidity) {
        accessory.addService(this.hapServ.HumiditySensor, 'Battery Level', 'batterylevel')
      }

      // Remove the 'battery' humidity service if it exists and user doesn't want it
      if (accessory.getService('Battery Level') && !this.config.showBattHumidity) {
        accessory.removeService(accessory.getService('Battery Level'))
      }

      // Save the device control information to the accessory
      accessory.control = loadedDevice

      // Setup a listener for the device 'ready' event
      accessory.control.on('ready', event => {
        this.externalReadyUpdate(accessory, event)
      })

      // Setup a listener for the device 'CleanReport' event
      accessory.control.on('CleanReport', newStatus => {
        this.externalCleanUpdate(accessory, newStatus)
      })

      // Setup a listener for the device 'BatteryInfo' event
      accessory.control.on('BatteryInfo', newValue => {
        this.externalBatteryUpdate(accessory, newValue)
      })

      // Setup a listener for the device 'ChargeState' event
      accessory.control.on('ChargeState', newStatus => {
        this.externalChargeUpdate(accessory, newStatus)
      })

      // Setup a listener for the device 'message' event
      accessory.control.on('message', msg => {
        this.externalMessageUpdate(accessory, msg)
      })

      // Setup a listener for the device 'Error' event
      accessory.control.on('Error', err => {
        this.externalErrorUpdate(accessory, err)
      })

      // Check the connection to the device
      if (!accessory.control || !accessory.control.is_ready) {
        accessory.control.connect_and_wait_until_ready()
      }

      // Log the initialised device
      this.log('[%s] %s %s.', accessory.displayName, this.messages.devInit, device.did)

      // Update any changes to the accessory to the platform
      this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(device.did, accessory)

      // Refresh the current state of the accessory
      this.refreshAccessory(accessory)
    } catch (err) {
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', device.deviceName, this.messages.devNotInit, eText)
    }
  }

  refreshAccessory (accessory) {
    try {
      // Check the accessory is ready to be controlled
      if (accessory.control) {
        if (accessory.control.is_ready) {
          // Run the commands to get the state of the device
          accessory.control.run('GetBatteryState')
          accessory.control.run('GetChargeState')
          accessory.control.run('GetCleanState')
        } else {
          // The device isn't ready to be sent commands
          accessory.control.connect_and_wait_until_ready()
        }
      }
    } catch (err) {
      // Catch any errors in the refresh process
      const eText = this.funcs.parseError(err)
      const name = accessory.displayName
      this.log.warn('[%s] %s %s.', name, this.messages.devNotRef, eText)
    }
  }

  addAccessory (device) {
    // Add an accessory to Homebridge
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
      return accessory
    } catch (err) {
      // Catch any errors during add
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', displayName, this.messages.devNotAdd, eText)
    }
  }

  configureAccessory (accessory) {
    // Function is called to retrieve each accessory from the cache on startup
    if (!this.log) {
      return
    }
    try {
      this.devicesInHB.set(accessory.context.ecoDeviceId, accessory)
    } catch (err) {
      // Catch any errors during retrieve
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.devNotConf, eText)
    }
  }

  removeAccessory (accessory) {
    // Remove an accessory from Homebridge
    try {
      this.api.unregisterPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.delete(accessory.context.hbDeviceId)
      this.log('[%s] %s.', accessory.displayName, this.messages.devRemove)
    } catch (err) {
      // Catch any errors during remove
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

// Export the plugin to Homebridge
module.exports = hb => hb.registerPlatform(PLUGIN.alias, DeebotPlatform)
