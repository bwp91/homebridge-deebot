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
    this.messages = require('./utils/lang-en')
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
      this.devices = {}

      // Apply the user's configuration
      this.config = this.consts.defaultConfig
      this.applyUserConfig(config)

      // Create further variables needed by the plugin
      this.devicesInHB = new Map()
      this.devicesInEC = new Map()
      this.hapServ = api.hap.Service
      this.hapChar = api.hap.Characteristic

      // Set up the Homebridge events
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
    const logDefault = (k, def) => {
      this.log.warn('%s [%s] %s %s.', this.messages.cfgItem, k, this.messages.cfgDef, def)
    }
    const logIgnore = k => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, k, this.messages.cfgIgn)
    }
    const logIgnoreItem = k => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, k, this.messages.cfgIgnItem)
    }
    const logIncrease = (k, min) => {
      this.log.warn('%s [%s] %s %s.', this.messages.cfgItem, k, this.messages.cfgLow, min)
    }
    const logQuotes = k => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, k, this.messages.cfgQts)
    }
    const logRemove = k => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, k, this.messages.cfgRmv)
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
        case 'encodedPassword':
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
        case 'devices':
          if (Array.isArray(val) && val.length > 0) {
            val.forEach(x => {
              if (!x.deviceId) {
                logIgnoreItem(key)
                return
              }
              const id = x.deviceId.replace(/[\s]+/g, '')
              const entries = Object.entries(x)
              if (entries.length === 1) {
                logRemove(key + '.' + id)
                return
              }
              this[key][id] = this.consts.defaultDevice
              for (const [k, v] of entries) {
                if (!this.consts.allowedProps.includes(k)) {
                  logRemove(key + '.' + id + '.' + k)
                  continue
                }
                switch (k) {
                  case 'deviceId':
                  case 'label':
                    break
                  case 'hideMotionSensor':
                  case 'showBattHumidity':
                  case 'showMotionLowBatt':
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    this[key][id][k] = v === 'false' ? false : !!v
                    break
                  case 'lowBattThreshold':
                  case 'motionDuration': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const intVal = parseInt(v)
                    if (isNaN(intVal)) {
                      logDefault(key + '.' + id + '.' + k, this.consts.defaultValues[k])
                      this[key][id][k] = this.consts.defaultValues[k]
                    } else if (intVal < this.consts.minValues[k]) {
                      logIncrease(key + '.' + id + '.' + k, this.consts.minValues[k])
                      this[key][id][k] = this.consts.minValues[k]
                    } else {
                      this[key][id][k] = intVal
                    }
                    break
                  }
                }
              }
            })
          } else {
            logIgnore(key)
          }
          break
        case 'name':
        case 'platform':
        case 'plugin_map':
          break
        case 'password':
          if (typeof val !== 'string' || val === '') {
            throw new Error(this.messages.invalidPassword)
          }
          this.config.password = val
          break
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
    // Plugin has finished initialising so now onto setup
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

      // Check to see if the user has encoded their password
      if (this.config.encodedPassword) {
        const buff = Buffer.from(this.config.password, 'base64')
        this.config.password = buff.toString('utf8')
      }

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
      const randIndex = Math.floor(Math.random() * this.messages.zWelcome.length)
      this.log('%s. %s', this.messages.complete, this.messages.zWelcome[randIndex])
    } catch (err) {
      // Catch any errors during setup
      const eText = err.message === this.messages.disabled
        ? err.message
        : this.funcs.parseError(err)
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
      // Generate the Homebridge UUID from the device id
      const uuid = this.api.hap.uuid.generate(device.did)

      // If the accessory is in the ignored devices list then remove it
      if (this.config.ignoredDevices.includes(device.did)) {
        if (this.devicesInHB.has(uuid)) {
          this.removeAccessory(this.devicesInHB.get(uuid))
        }
        return
      }

      // Obtain the user configuraton for this device
      this.devices[device.did] = this.funcs.hasProperty(this.devices, device.did)
        ? this.devices[device.did]
        : this.consts.defaultDevice

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
      const accessory = this.devicesInHB.has(uuid)
        ? this.devicesInHB.get(uuid)
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
      cleanService.getCharacteristic(this.hapChar.On).onSet(async value => {
        await this.internalCleanUpdate(accessory, value)
      })

      // Add the set handler to the 'charge' switch on/off characteristic
      chargeService.getCharacteristic(this.hapChar.On).onSet(async value => {
        await this.internalChargeUpdate(accessory, value)
      })

      // Add the 'attention' motion service if it doesn't already exist
      if (
        !accessory.getService('Attention') &&
        !this.devices[accessory.context.ecoDeviceId].hideMotionSensor
      ) {
        accessory.addService(this.hapServ.MotionSensor, 'Attention', 'attention')
      }

      // Remove the 'attention' motion service if it exists and user doesn't want it
      if (
        accessory.getService('Attention') &&
        this.devices[accessory.context.ecoDeviceId].hideMotionSensor
      ) {
        accessory.removeService(accessory.getService('Attention'))
      }

      // Set the motion sensor off if exists when the plugin initially loads
      if (accessory.getService('Attention')) {
        accessory.getService('Attention')
          .updateCharacteristic(this.hapChar.MotionDetected, false)
      }

      // Add the battery service if it doesn't already exist
      if (!accessory.getService(this.hapServ.BatteryService)) {
        accessory.addService(this.hapServ.BatteryService)
      }

      // Add the 'battery' humidity service if it doesn't already exist and user wants it
      if (
        !accessory.getService('Battery Level') &&
        this.devices[accessory.context.ecoDeviceId].showBattHumidity
      ) {
        accessory.addService(this.hapServ.HumiditySensor, 'Battery Level', 'batterylevel')
      }

      // Remove the 'battery' humidity service if it exists and user doesn't want it
      if (
        accessory.getService('Battery Level') &&
        !this.devices[accessory.context.ecoDeviceId].showBattHumidity
      ) {
        accessory.removeService(accessory.getService('Battery Level'))
      }

      // Save the device control information to the accessory
      accessory.control = loadedDevice

      // Set up a listener for the device 'ready' event
      accessory.control.on('ready', event => {
        this.externalReadyUpdate(accessory, event)
      })

      // Set up a listener for the device 'CleanReport' event
      accessory.control.on('CleanReport', newStatus => {
        this.externalCleanUpdate(accessory, newStatus)
      })

      // Set up a listener for the device 'BatteryInfo' event
      accessory.control.on('BatteryInfo', newValue => {
        this.externalBatteryUpdate(accessory, newValue)
      })

      // Set up a listener for the device 'ChargeState' event
      accessory.control.on('ChargeState', newStatus => {
        this.externalChargeUpdate(accessory, newStatus)
      })

      // Set up a listener for the device 'message' event
      accessory.control.on('message', msg => {
        this.externalMessageUpdate(accessory, msg)
      })

      // Set up a listener for the device 'Error' event
      accessory.control.on('Error', err => {
        this.externalErrorUpdate(accessory, err)
      })

      // Check the connection to the device
      if (!accessory.control || !accessory.control.is_ready) {
        accessory.control.connect_and_wait_until_ready()
      }

      // Update context information for Homebridge plugin-ui
      accessory.context.ecoDeviceId = loadedDevice.vacuum.did
      accessory.context.ecoCompany = loadedDevice.vacuum.company
      accessory.context.ecoModel = loadedDevice.deviceModel
      accessory.context.ecoImage = loadedDevice.deviceImageURL || false

      // Update any changes to the accessory to the platform
      this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(accessory.UUID, accessory)

      // Log more details of the device in debug
      if (this.config.debug) {
        // First the configuration options
        const config = JSON.stringify(this.devices[device.did])
        this.log('[%s] %s: %s.', accessory.displayName, this.messages.devInitOpts, config)

        // Then the extra device details
        const details = JSON.stringify(device)
        this.log('[%s] %s: %s.', accessory.displayName, this.messages.addInfo, details)
      }

      // Log the initialised device
      this.log('[%s] %s %s.', accessory.displayName, this.messages.devInit, device.did)

      // Refresh the current state of the accessory
      this.refreshAccessory(accessory)
    } catch (err) {
      const eText = this.funcs.parseError(err)
      const dName = device.nick || device.did
      this.log.warn('[%s] %s %s.', dName, this.messages.devNotInit, eText)
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
      const uuid = this.api.hap.uuid.generate(device.vacuum.did)
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
      accessory.context.ecoCompany = device.vacuum.company
      accessory.context.ecoModel = device.deviceModel
      accessory.context.ecoImage = device.deviceImageURL
      this.api.registerPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(accessory.UUID, accessory)
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
      this.devicesInHB.set(accessory.UUID, accessory)
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
      this.devicesInHB.delete(accessory.UUID)
      this.log('[%s] %s.', accessory.displayName, this.messages.devRemove)
    } catch (err) {
      // Catch any errors during remove
      const eText = this.funcs.parseError(err)
      const name = accessory.displayName
      this.log.warn('[%s] %s %s.', name, this.messages.devNotRemove, eText)
    }
  }

  async internalCleanUpdate (accessory, value) {
    try {
      // A one second delay seems to make turning off the 'charge' switch more responsive
      await this.funcs.sleep(1000)

      // Turn the 'charge' switch off since we have commanded the 'clean' switch
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false)

      // Select the correct command to run, either start or stop cleaning
      const order = value ? ['clean', 'auto'] : ['Stop']

      // Log the update if appropriate
      if (!this.config.disableDeviceLogging) {
        const text = value ? this.messages.cleaning : this.messages.stop
        this.log('[%s] %s [%s].', accessory.displayName, this.messages.curCleaning, text)
      }

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        return
      }

      // Send the command or queue if the device isn't ready for commands
      if (accessory.control.is_ready) {
        accessory.control.run.apply(accessory.control, order)
      } else {
        accessory.control.orderToSend = order
        accessory.control.connect_and_wait_until_ready()
      }
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.cleanFail, eText)
    }
  }

  async internalChargeUpdate (accessory, value) {
    try {
      // A one second delay seems to make everything more responsive
      await this.funcs.sleep(1000)

      // Don't continue if the device is already charging
      const battService = accessory.getService(this.hapServ.BatteryService)
      if (battService.getCharacteristic(this.hapChar.ChargingState).value !== 0) {
        return
      }

      // Select the correct command to run, either start or stop going to charge
      const order = value ? ['Charge'] : ['Stop']

      // Log the update if appropriate
      if (!this.config.disableDeviceLogging) {
        const text = value ? this.messages.returning : this.messages.stop
        this.log('[%s] %s [%s].', accessory.displayName, this.messages.curCharging, text)
      }

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        return
      }

      // Send the command or queue if the device isn't ready for commands
      if (accessory.control.is_ready) {
        accessory.control.run.apply(accessory.control, order)
      } else {
        accessory.control.orderToSend = order
        accessory.control.connect_and_wait_until_ready()
      }
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.chargeFail, eText)
    }
  }

  externalReadyUpdate (accessory, event) {
    try {
      // Called on the 'ready' event sent by the device so request update for states
      accessory.control.run('GetBatteryState')
      accessory.control.run('GetChargeState')
      accessory.control.run('GetCleanState')

      // Don't continue if we can't send commands to the device
      if (accessory.control) {
        return
      }

      // Check to see if we have any pending commands to send to the device
      if (!accessory.control.orderToSend) {
        return
      }

      // Log the pending commands if appropriate
      if (this.config.debug) {
        const order = accessory.control.orderToSend
        this.log('[%s] %s [%s].', accessory.displayName, this.messages.sendingCmd, order)
      }

      // Send pending command or commands to the device
      if (Array.isArray(accessory.control.orderToSend)) {
        accessory.control.run.apply(accessory.control, accessory.control.orderToSend)
      } else {
        accessory.control.run(accessory.control.orderToSend)
      }

      // Clear the queue of commands to send
      accessory.control.orderToSend = undefined
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inRdyFail, eText)
    }
  }

  externalCleanUpdate (accessory, newStatus) {
    try {
      // Check if the new cleaning state is different from the cached state
      if (accessory.cacheClean !== newStatus) {
        // State is different so update service
        accessory.getService('Clean')
          .updateCharacteristic(this.hapChar.On, newStatus === 'auto')

        // Log the change if appropriate
        if (this.config.debug || !this.config.disableDeviceLogging) {
          const st = newStatus
          this.log('[%s] %s [%s].', accessory.displayName, this.messages.curCleaning, st)
        }
      }

      // Always update the cache with the new cleaning status
      accessory.cacheClean = newStatus
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inClnFail, eText)
    }
  }

  externalChargeUpdate (accessory, newStatus) {
    try {
      // Check if the new charging state is different from the cached state
      if (accessory.cacheCharge !== newStatus) {
        // State is different so update service
        accessory.getService('Go Charge')
          .updateCharacteristic(this.hapChar.On, newStatus === 'returning')
        const chargeState = newStatus === 'charging' ? 1 : 0
        accessory.getService(this.hapServ.BatteryService)
          .updateCharacteristic(this.hapChar.ChargingState, chargeState)

        // Log the change if appropriate
        if (this.config.debug || !this.config.disableDeviceLogging) {
          const st = newStatus
          this.log('[%s] %s [%s].', accessory.displayName, this.messages.curCharging, st)
        }
      }

      // Always update the cache with the new charging status
      accessory.cacheCharge = newStatus
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inChgFail, eText)
    }
  }

  externalBatteryUpdate (accessory, newVal) {
    try {
      // Check the value given is between 0 and 100
      newVal = Math.min(Math.max(Math.round(newVal), 0), 100)

      // Check if the new battery value is different from the cached state
      if (accessory.cacheBattery !== newVal) {
        // Value is different so update services
        const threshold = this.devices[accessory.context.ecoDeviceId].lowBattThreshold
        const lowBattStatus = newVal <= threshold ? 1 : 0
        accessory.getService(this.hapServ.BatteryService)
          .updateCharacteristic(this.hapChar.BatteryLevel, newVal)
          .updateCharacteristic(this.hapChar.StatusLowBattery, lowBattStatus)

        // Also update the 'battery' humidity service if it exists
        if (this.devices[accessory.context.ecoDeviceId].showBattHumidity) {
          accessory.getService('Battery Level')
            .updateCharacteristic(this.hapChar.CurrentRelativeHumidity, newVal)
        }

        // Log the change if appropriate
        if (this.config.debug || !this.config.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', accessory.displayName, this.messages.curBatt, newVal)
        }

        // If the user wants a message and a buzz from the motion sensor then do it
        if (
          this.devices[accessory.context.ecoDeviceId].showMotionLowBatt &&
          newVal <= this.devices[accessory.context.ecoDeviceId].lowBattThreshold &&
          !accessory.cacheShownMotionLowBatt
        ) {
          this.externalMessageUpdate(accessory, this.messages.lowBattMsg + newVal + '%')
          accessory.cacheShownMotionLowBatt = true
        }

        // Revert the cache to false once the device has charged above the threshold
        if (newVal > this.devices[accessory.context.ecoDeviceId].lowBattThreshold) {
          accessory.cacheShownMotionLowBatt = false
        }
      }

      // Always update the cache with the new battery value
      accessory.cacheBattery = newVal
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inBattFail, eText)
    }
  }

  async externalMessageUpdate (accessory, msg) {
    try {
      // Check to see if the motion sensor is already in use or if it's an ignored message
      if (accessory.cacheInUse || this.consts.messagesToIgnore.includes(msg)) {
        return
      }

      // We don't want duplicate notifications during the motion sensor in use time
      accessory.cacheInUse = true

      // Log the message sent from the device
      this.log.warn('[%s] %s [%s].', accessory.displayName, this.messages.sentMsg, msg)

      // Update the motion sensor to motion detected if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention')
          .updateCharacteristic(this.hapChar.MotionDetected, true)
      }

      // The motion sensor stays on for the time configured by the user so we wait
      const duration = this.devices[accessory.context.ecoDeviceId].motionDuration
      await this.funcs.sleep(duration * 1000)

      // Reset the motion sensor after waiting for the time above if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention')
          .updateCharacteristic(this.hapChar.MotionDetected, false)
      }

      // Update the inUse cache to false as we are complete here
      accessory.cacheInUse = false
    } catch (err) {
      // Catch any errors in the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inMsgFail, eText)
    }
  }

  async externalErrorUpdate (accessory, err) {
    try {
      // Check to see if the motion sensor is already in use or if it's an ignored message
      if (accessory.cacheInUse || this.consts.messagesToIgnore.includes(err)) {
        return
      }

      // We don't want duplicate notifications during the motion sensor in use time
      accessory.cacheInUse = true

      // Log the message sent from the device
      this.log.warn('[%s] %s [%s].', accessory.displayName, this.messages.sentErr, err)

      // Update the motion sensor to motion detected if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention')
          .updateCharacteristic(this.hapChar.MotionDetected, true)
      }

      // The device has an error so turn both 'clean' and 'charge' switches off
      accessory.getService('Clean').updateCharacteristic(this.hapChar.On, false)
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false)

      // The motion sensor stays on for the time configured by the user so we wait
      await this.funcs.sleep(this.config.motionDuration * 1000)

      // Reset the motion sensor after waiting for the time above if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention')
          .updateCharacteristic(this.hapChar.MotionDetected, false)
      }

      // Update the inUse cache to false as we are complete here
      accessory.cacheInUse = false
    } catch (err) {
      // Catch any errors in the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.inErrFail, eText)
    }
  }
}

// Export the plugin to Homebridge
module.exports = hb => hb.registerPlatform(PLUGIN.alias, DeebotPlatform)
