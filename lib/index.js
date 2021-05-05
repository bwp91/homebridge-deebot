/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

// Packages and constant variables for this class
const deebotClient = require('ecovacs-deebot')
const devicesInHB = new Map()
const nodeMachineId = require('node-machine-id')
const plugin = require('./../package.json')

// Create the platform class
class DeebotPlatform {
  constructor (log, config, api) {
    // Don't load the plugin if these aren't accessible for any reason
    if (!log || !api) {
      return
    }

    // Begin plugin initialisation
    try {
      this.api = api
      this.consts = require('./utils/constants')
      this.funcs = require('./utils/functions')
      this.log = log

      // Configuration objects for accessories
      this.devices = {}

      // Retrieve the user's chosen language file
      const language = config && config.language &&
        this.consts.allowed.languages.includes(config.language)
        ? config.language
        : this.consts.defaultValues.language
      this.lang = require('./utils/lang-' + language)

      // Check the user has configured the plugin
      if (!config || !config.username || !config.password || !config.countryCode) {
        throw new Error(this.lang.missingCreds)
      }

      // Apply the user's configuration
      this.config = this.consts.defaultConfig
      this.applyUserConfig(config)

      // Create further variables needed by the plugin
      this.hapServ = api.hap.Service
      this.hapChar = api.hap.Characteristic

      // Set up the Homebridge events
      this.api.on('didFinishLaunching', this.pluginSetup.bind(this))
      this.api.on('shutdown', this.pluginShutdown.bind(this))
    } catch (err) {
      // Catch any errors during initialisation
      const hideErrLines = [
        this.lang.invalidCCode,
        this.lang.invalidPassword,
        this.lang.invalidUsername,
        this.lang.missingCreds
      ]
      const eText = hideErrLines.includes(err.message)
        ? err.message
        : this.funcs.parseError(err)
      log.warn('***** %s [v%s]. *****', this.lang.disabling, plugin.version)
      log.warn('***** %s. *****', eText)
    }
  }

  applyUserConfig (config) {
    // These shorthand functions save line space during config parsing
    const logDefault = (k, def) => {
      this.log.warn('%s [%s] %s %s.', this.lang.cfgItem, k, this.lang.cfgDef, def)
    }
    const logIgnore = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgIgn)
    }
    const logIgnoreItem = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgIgnItem)
    }
    const logIncrease = (k, min) => {
      this.log.warn('%s [%s] %s %s.', this.lang.cfgItem, k, this.lang.cfgLow, min)
    }
    const logQuotes = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgQts)
    }
    const logRemove = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgRmv)
    }

    // Begin applying the user's config
    for (const [key, val] of Object.entries(config)) {
      switch (key) {
        case 'countryCode':
          if (typeof val !== 'string' || val === '') {
            throw new Error(this.lang.invalidCCode)
          }
          this.config.countryCode = val.toUpperCase().replace(/[^A-Z]+/g, '')
          if (!this.consts.validCCodes.includes(this.config.countryCode)) {
            throw new Error(this.lang.invalidCCode)
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
                if (!this.consts.allowed.deviceProperties.includes(k)) {
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
        case 'language': {
          const inSet = this.consts.allowed.languages.includes(val)
          if (typeof val !== 'string' || !inSet) {
            logIgnore(key)
          }
          this.config.language = inSet ? val : this.consts.defaultValues[key]
          break
        }
        case 'name':
        case 'platform':
        case 'plugin_map':
          break
        case 'password':
          if (typeof val !== 'string' || val === '') {
            throw new Error(this.lang.invalidPassword)
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
            throw new Error(this.lang.invalidUsername)
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
        devicesInHB.forEach(accessory => {
          this.removeAccessory(accessory)
        })
        throw new Error(this.lang.disabled)
      }

      // Log that the plugin initialisation has been successful
      this.log('[v%s] %s.', plugin.version, this.lang.initialised)

      // Check to see if the user has encoded their password
      if (this.config.encodedPassword) {
        const buff = Buffer.from(this.config.password, 'base64')
        this.config.password = buff.toString('utf8').replace(/(\r\n|\n|\r)/gm, '').trim()
      }

      // Connect to ECOVACS
      this.ecovacsAPI = new deebotClient.EcoVacsAPI(
        deebotClient.EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync()),
        this.config.countryCode,
        deebotClient.countries[this.config.countryCode].continent
      )
      await this.ecovacsAPI.connect(
        this.config.username,
        deebotClient.EcoVacsAPI.md5(this.config.password)
      )

      // Get a device list from ECOVACS
      const deviceList = await this.ecovacsAPI.devices()

      // Check the request for device list was successful
      if (!Array.isArray(deviceList)) {
        throw new Error(this.lang.deviceListFail)
      }

      // Initialise each device into Homebridge
      deviceList.forEach(device => {
        this.initialiseDevice(device)
      })

      // Start the polling interval for device state refresh
      this.refreshInterval = setInterval(
        () => {
          devicesInHB.forEach(accessory => {
            this.refreshAccessory(accessory)
          })
        },
        this.config.refreshTime * 1000
      )

      // Log that the plugin setup has been successful with a welcome message
      const randIndex = Math.floor(Math.random() * this.lang.zWelcome.length)
      this.log('%s. %s', this.lang.complete, this.lang.zWelcome[randIndex])
    } catch (err) {
      // Catch any errors during setup
      const eText = err.message === this.lang.disabled
        ? err.message
        : this.funcs.parseError(err)
      this.log.warn('***** %s [v%s]. *****', this.lang.disabling, plugin.version)
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
      devicesInHB.forEach(accessory => {
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
        if (devicesInHB.has(uuid)) {
          this.removeAccessory(devicesInHB.get(uuid))
        }
        return
      }

      // Obtain the user configuration for this device
      this.devices[device.did] = this.funcs.hasProperty(this.devices, device.did)
        ? this.devices[device.did]
        : this.consts.defaultDevice

      // Load the device control information from ECOVACS
      const loadedDevice = this.ecovacsAPI.getVacBot(
        this.ecovacsAPI.uid,
        deebotClient.EcoVacsAPI.REALM,
        this.ecovacsAPI.resource,
        this.ecovacsAPI.user_access_token,
        device,
        deebotClient.countries[this.config.countryCode].continent
      )

      // Get the cached accessory or add to Homebridge if doesn't exist
      const accessory = devicesInHB.get(uuid) || this.addAccessory(loadedDevice)

      // Final check the accessory now exists in Homebridge
      if (!accessory) {
        throw new Error(this.lang.accNotFound)
      }

      // Create a cache of 'orders to send' to the device
      accessory.ordersToSend = []

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
        accessory.getService('Attention').updateCharacteristic(
          this.hapChar.MotionDetected,
          false
        )
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

      // Connect to the device
      accessory.control.connect()

      // Update any changes to the accessory to the platform
      this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
      devicesInHB.set(accessory.UUID, accessory)

      // Log more details of the device in debug
      if (this.config.debug) {
        // First the configuration options
        const config = JSON.stringify(this.devices[device.did])
        this.log('[%s] %s: %s.', accessory.displayName, this.lang.devInitOpts, config)

        // Then the extra device details
        const details = JSON.stringify(device)
        this.log('[%s] %s: %s.', accessory.displayName, this.lang.addInfo, details)
      }

      // Log the initialised device
      this.log('[%s] %s %s.', accessory.displayName, this.lang.devInit, device.did)

      // Refresh the current state of the accessory
      this.refreshAccessory(accessory)
    } catch (err) {
      const eText = this.funcs.parseError(err)
      const dName = device.nick || device.did
      this.log.warn('[%s] %s %s.', dName, this.lang.devNotInit, eText)
    }
  }

  refreshAccessory (accessory) {
    try {
      // Check the accessory is ready to be controlled
      if (accessory.control && accessory.control.is_ready) {
        // Run the commands to get the state of the device
        accessory.control.run('GetBatteryState')
        accessory.control.run('GetChargeState')
        accessory.control.run('GetCleanState')
      }
    } catch (err) {
      // Catch any errors in the refresh process
      const eText = this.funcs.parseError(err)
      const name = accessory.displayName
      this.log.warn('[%s] %s %s.', name, this.lang.devNotRef, eText)
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

      // Add context information for Homebridge plugin-ui
      accessory.context.ecoDeviceId = device.vacuum.did
      accessory.context.ecoCompany = device.vacuum.company
      accessory.context.ecoModel = device.deviceModel
      accessory.context.ecoImage = device.deviceImageURL
      this.api.registerPlatformAccessories(plugin.name, plugin.alias, [accessory])
      this.configureAccessory(accessory)
      this.log('[%s] %s.', displayName, this.lang.devAdd)
      return accessory
    } catch (err) {
      // Catch any errors during add
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', displayName, this.lang.devNotAdd, eText)
    }
  }

  configureAccessory (accessory) {
    // Function is called to retrieve each accessory from the cache on startup
    if (!this.log) {
      return
    }
    try {
      accessory.on('identify', (paired, callback) => {
        callback()
        this.log('[%s] %s.', accessory.displayName, this.lang.identify)
      })
      devicesInHB.set(accessory.UUID, accessory)
    } catch (err) {
      // Catch any errors during retrieve
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.devNotConf, eText)
    }
  }

  removeAccessory (accessory) {
    // Remove an accessory from Homebridge
    try {
      this.api.unregisterPlatformAccessories(plugin.name, plugin.alias, [accessory])
      devicesInHB.delete(accessory.UUID)
      this.log('[%s] %s.', accessory.displayName, this.lang.devRemove)
    } catch (err) {
      // Catch any errors during remove
      const eText = this.funcs.parseError(err)
      const name = accessory.displayName
      this.log.warn('[%s] %s %s.', name, this.lang.devNotRemove, eText)
    }
  }

  async internalCleanUpdate (accessory, value) {
    try {
      // A one second delay seems to make turning off the 'charge' switch more responsive
      await this.funcs.sleep(1000)

      // Turn the 'charge' switch off since we have commanded the 'clean' switch
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false)

      // Select the correct command to run, either start or stop cleaning
      const order = value ? 'Clean' : 'Stop'

      // Log the update if appropriate
      if (!this.config.disableDeviceLogging) {
        const text = value ? this.lang.cleaning : this.lang.stop
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCleaning, text)
      }

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(this.lang.errNotInit)
      }

      // Send the command or queue if the device isn't ready for commands
      if (accessory.control.is_ready) {
        accessory.control.run(order)
      } else {
        accessory.ordersToSend.push(order)
      }
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.cleanFail, eText)
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
      const order = value ? 'Charge' : 'Stop'

      // Log the update if appropriate
      if (!this.config.disableDeviceLogging) {
        const text = value ? this.lang.returning : this.lang.stop
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCharging, text)
      }

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(this.lang.errNotInit)
      }

      // Send the command or queue if the device isn't ready for commands
      if (accessory.control.is_ready) {
        accessory.control.run(order)
      } else {
        accessory.ordersToSend.push(order)
      }
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.chargeFail, eText)
    }
  }

  externalReadyUpdate (accessory, event) {
    try {
      // Called on the 'ready' event sent by the device so request update for states
      accessory.control.run('GetBatteryState')
      accessory.control.run('GetChargeState')
      accessory.control.run('GetCleanState')

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(this.lang.errNotInit)
      }

      // Check to see if we have any pending commands to send to the device
      if (accessory.ordersToSend.length === 0) {
        return
      }

      // Loop through the pending orders to send
      accessory.ordersToSend.forEach(order => {
        // Send command to the device
        accessory.control.run(order)

        // Log the command if appropriate
        if (this.config.debug) {
          this.log('[%s] %s [%s].', accessory.displayName, this.lang.sendCmd, order)
        }
      })

      // Clear the queue of commands to send
      accessory.ordersToSend = []
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inRdyFail, eText)
    }
  }

  externalCleanUpdate (accessory, newStatus) {
    try {
      // Check if the new cleaning state is different from the cached state
      if (accessory.cacheClean !== newStatus) {
        // State is different so update service
        accessory.getService('Clean').updateCharacteristic(
          this.hapChar.On,
          newStatus === 'auto'
        )

        // Log the change if appropriate
        if (this.config.debug || !this.config.disableDeviceLogging) {
          const st = newStatus
          this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCleaning, st)
        }
      }

      // Always update the cache with the new cleaning status
      accessory.cacheClean = newStatus
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inClnFail, eText)
    }
  }

  externalChargeUpdate (accessory, newStatus) {
    try {
      // Check if the new charging state is different from the cached state
      if (accessory.cacheCharge !== newStatus) {
        // State is different so update service
        accessory.getService('Go Charge').updateCharacteristic(
          this.hapChar.On,
          newStatus === 'returning'
        )
        const chargeState = newStatus === 'charging' ? 1 : 0
        accessory.getService(this.hapServ.BatteryService).updateCharacteristic(
          this.hapChar.ChargingState,
          chargeState
        )

        // Log the change if appropriate
        if (this.config.debug || !this.config.disableDeviceLogging) {
          const st = newStatus
          this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCharging, st)
        }
      }

      // Always update the cache with the new charging status
      accessory.cacheCharge = newStatus
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inChgFail, eText)
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
        accessory.getService(this.hapServ.BatteryService).updateCharacteristic(
          this.hapChar.BatteryLevel,
          newVal
        )
        accessory.getService(this.hapServ.BatteryService).updateCharacteristic(
          this.hapChar.StatusLowBattery,
          lowBattStatus
        )

        // Also update the 'battery' humidity service if it exists
        if (this.devices[accessory.context.ecoDeviceId].showBattHumidity) {
          accessory.getService('Battery Level').updateCharacteristic(
            this.hapChar.CurrentRelativeHumidity,
            newVal
          )
        }

        // Log the change if appropriate
        if (this.config.debug || !this.config.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', accessory.displayName, this.lang.curBatt, newVal)
        }

        // If the user wants a message and a buzz from the motion sensor then do it
        if (
          this.devices[accessory.context.ecoDeviceId].showMotionLowBatt &&
          newVal <= this.devices[accessory.context.ecoDeviceId].lowBattThreshold &&
          !accessory.cacheShownMotionLowBatt
        ) {
          this.externalMessageUpdate(accessory, this.lang.lowBattMsg + newVal + '%')
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
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inBattFail, eText)
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
      this.log.warn('[%s] %s [%s].', accessory.displayName, this.lang.sentMsg, msg)

      // Update the motion sensor to motion detected if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(
          this.hapChar.MotionDetected,
          true
        )
      }

      // The motion sensor stays on for the time configured by the user so we wait
      const duration = this.devices[accessory.context.ecoDeviceId].motionDuration
      await this.funcs.sleep(duration * 1000)

      // Reset the motion sensor after waiting for the time above if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(
          this.hapChar.MotionDetected,
          false
        )
      }

      // Update the inUse cache to false as we are complete here
      accessory.cacheInUse = false
    } catch (err) {
      // Catch any errors in the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inMsgFail, eText)
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
      this.log.warn('[%s] %s [%s].', accessory.displayName, this.lang.sentErr, err)

      // Update the motion sensor to motion detected if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(
          this.hapChar.MotionDetected,
          true
        )
      }

      // The device has an error so turn both 'clean' and 'charge' switches off
      accessory.getService('Clean').updateCharacteristic(this.hapChar.On, false)
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false)

      // The motion sensor stays on for the time configured by the user so we wait
      await this.funcs.sleep(this.config.motionDuration * 1000)

      // Reset the motion sensor after waiting for the time above if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(
          this.hapChar.MotionDetected,
          false
        )
      }

      // Update the inUse cache to false as we are complete here
      accessory.cacheInUse = false
    } catch (err) {
      // Catch any errors in the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inErrFail, eText)
    }
  }
}

// Export the plugin to Homebridge
module.exports = hb => hb.registerPlatform(plugin.alias, DeebotPlatform)
