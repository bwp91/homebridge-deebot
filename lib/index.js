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
      this.deviceConf = {}
      this.ignoredDevices = []

      // Retrieve the user's chosen language file
      this.lang = require('./utils/lang-en')

      // Make sure user is running Homebridge v1.3 or above
      if (!api.versionGreaterOrEqual || !api.versionGreaterOrEqual('1.3.0')) {
        throw new Error(this.lang.hbVersionFail)
      }

      // Check the user has configured the plugin
      if (!config) {
        throw new Error(this.lang.pluginNotConf)
      }

      // Log some environment info for debugging
      this.log(
        '%s v%s | Node %s | HB v%s%s...',
        this.lang.initialising,
        plugin.version,
        process.version,
        api.serverVersion,
        config.plugin_map
          ? ' | HOOBS v3'
          : require('os')
              .hostname()
              .includes('hoobs')
          ? ' | HOOBS v4'
          : ''
      )

      // Check the user has entered the required config fields
      if (!config.username || !config.password || !config.countryCode) {
        throw new Error(this.lang.missingCreds)
      }

      // Apply the user's configuration
      this.config = this.consts.defaultConfig
      this.applyUserConfig(config)

      // Create further variables needed by the plugin
      this.hapErr = api.hap.HapStatusError
      this.hapChar = api.hap.Characteristic
      this.hapServ = api.hap.Service

      // Set up the Homebridge events
      this.api.on('didFinishLaunching', () => this.pluginSetup())
      this.api.on('shutdown', () => this.pluginShutdown())
    } catch (err) {
      // Catch any errors during initialisation
      const eText = this.funcs.parseError(err, [
        this.lang.hbVersionFail,
        this.lang.pluginNotConf,
        this.lang.missingCreds,
        this.lang.invalidCCode,
        this.lang.invalidPassword,
        this.lang.invalidUsername
      ])
      log.warn('***** %s. *****', this.lang.disabling)
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
          if (typeof val === 'string') {
            logQuotes(key)
          }
          this.config[key] = val === 'false' ? false : !!val
          break
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
              this.deviceConf[id] = this.consts.defaultDevice
              for (const [k, v] of entries) {
                if (!this.consts.allowed.deviceProperties.includes(k)) {
                  logRemove(key + '.' + id + '.' + k)
                  continue
                }
                switch (k) {
                  case 'command1':
                  case 'command2':
                  case 'command3':
                  case 'command4':
                  case 'command5':
                  case 'command6':
                  case 'command7':
                  case 'command8':
                  case 'command9':
                  case 'command10': {
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      const parts = v.split('/')
                      if (parts.length === 2 && ['SpotArea', 'CustomArea'].includes(parts[0])) {
                        this.deviceConf[id][k] = v
                      } else {
                        logIgnore(key + '.' + id + '.' + k)
                      }
                    }
                    break
                  }
                  case 'deviceId':
                  case 'label':
                    break
                  case 'hideMotionSensor':
                  case 'showBattHumidity':
                  case 'showMotionLowBatt':
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    this.deviceConf[id][k] = v === 'false' ? false : !!v
                    break
                  case 'ignoreDevice':
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    if (!!v && v !== 'false') {
                      this.ignoredDevices.push(id)
                    }
                    break
                  case 'lowBattThreshold':
                  case 'motionDuration': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const intVal = parseInt(v)
                    if (isNaN(intVal)) {
                      logDefault(key + '.' + id + '.' + k, this.consts.defaultValues[k])
                      this.deviceConf[id][k] = this.consts.defaultValues[k]
                    } else if (intVal < this.consts.minValues[k]) {
                      logIncrease(key + '.' + id + '.' + k, this.consts.minValues[k])
                      this.deviceConf[id][k] = this.consts.minValues[k]
                    } else {
                      this.deviceConf[id][k] = intVal
                    }
                    break
                  }
                  case 'overrideLogging': {
                    const inSet = this.consts.allowed[k].includes(v)
                    if (typeof v !== 'string' || !inSet) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.deviceConf[id][k] = inSet ? v : this.consts.defaultValues[k]
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
        devicesInHB.forEach(accessory => this.removeAccessory(accessory))
        throw new Error(this.lang.disabled)
      }

      // Log that the plugin initialisation has been successful
      this.log('%s.', this.lang.initialised)

      // Include the custom characteristics visible in Eve
      this.cusChar = new (require('./utils/custom-chars'))(this.api)

      // Connect to ECOVACS
      this.ecovacsAPI = new deebotClient.EcoVacsAPI(
        deebotClient.EcoVacsAPI.getDeviceId(nodeMachineId.machineIdSync()),
        this.config.countryCode,
        deebotClient.countries[this.config.countryCode].continent
      )

      // Display version of the ecovacs-deebot library in the log
      this.log('%s v%s.', this.lang.ecovacsLibVersion, this.ecovacsAPI.getVersion())

      // Attempt to login to ECOVACS
      try {
        await this.ecovacsAPI.connect(
          this.config.username,
          deebotClient.EcoVacsAPI.md5(this.config.password)
        )
      } catch (err) {
        // Check if password error and reattempt with base64 decoded version of password
        if (err.message && err.message.includes('1010')) {
          const buff = Buffer.from(this.config.password, 'base64')
          this.config.password = buff
            .toString('utf8')
            .replace(/(\r\n|\n|\r)/gm, '')
            .trim()
          await this.ecovacsAPI.connect(
            this.config.username,
            deebotClient.EcoVacsAPI.md5(this.config.password)
          )
        } else {
          throw err
        }
      }

      // Get a device list from ECOVACS
      const deviceList = await this.ecovacsAPI.devices()

      // Check the request for device list was successful
      if (!Array.isArray(deviceList)) {
        throw new Error(this.lang.deviceListFail)
      }

      // Initialise each device into Homebridge
      deviceList.forEach(device => this.initialiseDevice(device))

      // Start the polling interval for device state refresh
      this.refreshInterval = setInterval(() => {
        devicesInHB.forEach(accessory => this.refreshAccessory(accessory))
      }, this.config.refreshTime * 1000)

      // Log that the plugin setup has been successful with a welcome message
      const randIndex = Math.floor(Math.random() * this.lang.zWelcome.length)
      this.log('%s. %s', this.lang.complete, this.lang.zWelcome[randIndex])
    } catch (err) {
      // Catch any errors during setup
      const eText = this.funcs.parseError(err, [this.lang.disabled, this.lang.deviceListFail])
      this.log.warn('***** %s. *****', this.lang.disabling)
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
      if (this.ignoredDevices.includes(device.did)) {
        if (devicesInHB.has(uuid)) {
          this.removeAccessory(devicesInHB.get(uuid))
        }
        return
      }

      // Obtain the user configuration for this device
      this.deviceConf[device.did] = this.funcs.hasProperty(this.deviceConf, device.did)
        ? this.deviceConf[device.did]
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

      // Add the user logging options to the context
      switch (this.deviceConf[device.did].overrideLogging) {
        case 'standard':
          accessory.context.enableLogging = true
          accessory.context.enableDebugLogging = false
          break
        case 'debug':
          accessory.context.enableLogging = true
          accessory.context.enableDebugLogging = true
          break
        case 'disable':
          accessory.context.enableLogging = false
          accessory.context.enableDebugLogging = false
          break
        default:
          accessory.context.enableLogging = !this.config.disableDeviceLogging
          accessory.context.enableDebugLogging = this.config.debug
          break
      }

      // Initially set the device online value to false (to be updated later)
      accessory.context.isOnline = false
      accessory.context.lastMsg = ''

      // Add the 'clean' switch service if it doesn't already exist
      const cleanService =
        accessory.getService('Clean') || accessory.addService(this.hapServ.Switch, 'Clean', 'clean')

      // Add the 'charge' switch service if it doesn't already exist
      const chargeService =
        accessory.getService('Go Charge') ||
        accessory.addService(this.hapServ.Switch, 'Go Charge', 'gocharge')

      // Check if the speed characteristic has been added
      if (!cleanService.testCharacteristic(this.cusChar.MaxSpeed)) {
        cleanService.addCharacteristic(this.cusChar.MaxSpeed)
      }

      // Add the Eve characteristic for custom commands if any exist
      if (this.deviceConf[device.did].command1) {
        if (!cleanService.testCharacteristic(this.cusChar.Commands)) {
          cleanService.addCharacteristic(this.cusChar.Commands)
        }

        // Add the set characteristic
        cleanService.getCharacteristic(this.cusChar.Commands).onSet(async value => {
          await this.internalCommandUpdate(accessory, value)
        })
      } else {
        if (cleanService.testCharacteristic(this.cusChar.Commands)) {
          cleanService.removeCharacteristic(cleanService.getCharacteristic(this.cusChar.Commands))
        }
      }

      // Add the set handler to the 'clean' switch on/off characteristic
      cleanService.getCharacteristic(this.hapChar.On).onSet(async value => {
        await this.internalCleanUpdate(accessory, value)
      })

      // Add the set handler to the 'max speed' switch on/off characteristic
      cleanService.getCharacteristic(this.cusChar.MaxSpeed).onSet(async value => {
        await this.internalSpeedUpdate(accessory, value)
      })

      // Add the set handler to the 'charge' switch on/off characteristic
      chargeService.getCharacteristic(this.hapChar.On).onSet(async value => {
        await this.internalChargeUpdate(accessory, value)
      })

      // Add the 'attention' motion service if it doesn't already exist
      if (!accessory.getService('Attention') && !this.deviceConf[device.did].hideMotionSensor) {
        accessory.addService(this.hapServ.MotionSensor, 'Attention', 'attention')
      }

      // Remove the 'attention' motion service if it exists and user doesn't want it
      if (accessory.getService('Attention') && this.deviceConf[device.did].hideMotionSensor) {
        accessory.removeService(accessory.getService('Attention'))
      }

      // Set the motion sensor off if exists when the plugin initially loads
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, false)
      }

      // Remove deprecated 'BatteryService' in favour of 'Battery'
      if (accessory.getService(this.hapServ.BatteryService)) {
        accessory.removeService(this.hapServ.BatteryService)
      }

      // Add the battery service if it doesn't already exist
      if (!accessory.getService(this.hapServ.Battery)) {
        accessory.addService(this.hapServ.Battery)
      }

      // Add the 'battery' humidity service if it doesn't already exist and user wants it
      if (!accessory.getService('Battery Level') && this.deviceConf[device.did].showBattHumidity) {
        accessory.addService(this.hapServ.HumiditySensor, 'Battery Level', 'batterylevel')
      }

      // Remove the 'battery' humidity service if it exists and user doesn't want it
      if (accessory.getService('Battery Level') && !this.deviceConf[device.did].showBattHumidity) {
        accessory.removeService(accessory.getService('Battery Level'))
      }

      // Save the device control information to the accessory
      accessory.control = loadedDevice

      // Set up a listener for the device 'ready' event
      accessory.control.on('ready', event => {
        this.externalReadyUpdate(accessory, event)
      })

      // Set up a listener for the device 'CleanReport' event
      accessory.control.on('CleanReport', newVal => {
        this.externalCleanUpdate(accessory, newVal)
      })

      // Set up a listener for the device 'CleanSpeed' event
      accessory.control.on('CleanSpeed', newVal => {
        this.externalSpeedUpdate(accessory, newVal)
      })

      // Set up a listener for the device 'BatteryInfo' event
      accessory.control.on('BatteryInfo', newVal => {
        this.externalBatteryUpdate(accessory, newVal)
      })

      // Set up a listener for the device 'ChargeState' event
      accessory.control.on('ChargeState', newVal => {
        this.externalChargeUpdate(accessory, newVal)
      })

      // Set up a listener for the device 'NetInfoIP' event
      accessory.control.on('NetInfoIP', newVal => {
        this.externalIPUpdate(accessory, newVal)
      })

      // Set up a listener for the device 'NetInfoMAC' event
      accessory.control.on('NetInfoMAC', newVal => {
        this.externalMacUpdate(accessory, newVal)
      })

      // Set up a listener for the device 'message' event
      accessory.control.on('message', msg => {
        this.externalMessageUpdate(accessory, msg)
      })

      // Set up a listener for the device 'Error' event
      accessory.control.on('Error', err => {
        this.externalErrorUpdate(accessory, err)
      })

      // Set up listeners for map data if accessory debug logging is on
      if (accessory.context.enableDebugLogging) {
        accessory.control.on('Maps', maps => {
          this.log('[%s] Maps: %s.', accessory.displayName, JSON.stringify(maps))
          for (const i in maps.maps) {
            accessory.control.run('GetSpotAreas', maps.maps[i].mapID)
            accessory.control.run('GetVirtualBoundaries', maps.maps[i].mapID)
          }
        })

        accessory.control.on('MapSpotAreas', spotAreas => {
          this.log('[%s] MapSpotAreas: %s.', accessory.displayName, JSON.stringify(spotAreas))
          for (const i in spotAreas.mapSpotAreas) {
            accessory.control.run(
              'GetSpotAreaInfo',
              spotAreas.mapID,
              spotAreas.mapSpotAreas[i].mapSpotAreaID
            )
          }
        })

        accessory.control.on('MapSpotAreaInfo', area => {
          this.log('[%s] MapSpotAreaInfo: %s.', accessory.displayName, JSON.stringify(area))
        })

        accessory.control.on('MapVirtualBoundaries', vbs => {
          this.log('[%s] MapVirtualBoundaries: %s.', accessory.displayName, JSON.stringify(vbs))
          const vbsCombined = [...vbs.mapVirtualWalls, ...vbs.mapNoMopZones]
          const virtualBoundaryArray = []
          for (const i in vbsCombined) {
            virtualBoundaryArray[vbsCombined[i].mapVirtualBoundaryID] = vbsCombined[i]
          }
          for (const i in virtualBoundaryArray) {
            accessory.control.run(
              'GetVirtualBoundaryInfo',
              vbs.mapID,
              virtualBoundaryArray[i].mapVirtualBoundaryID,
              virtualBoundaryArray[i].mapVirtualBoundaryType
            )
          }
        })

        accessory.control.on('MapVirtualBoundaryInfo', vb => {
          this.log('[%s] MapVirtualBoundaryInfo: %s.', accessory.displayName, JSON.stringify(vb))
        })
      }

      // Connect to the device
      accessory.control.connect()

      // Update any changes to the accessory to the platform
      this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
      devicesInHB.set(accessory.UUID, accessory)

      // Log configuration and device initialisation
      this.log(
        '[%s] %s: %s.',
        accessory.displayName,
        this.lang.devInitOpts,
        JSON.stringify(this.deviceConf[device.did])
      )
      this.log('[%s] %s %s.', accessory.displayName, this.lang.devInit, device.did)

      // Log more details of the device in debug
      if (accessory.context.enableDebugLogging) {
        const details = JSON.stringify(device)
        this.log('[%s] %s: %s.', accessory.displayName, this.lang.addInfo, details)
      }

      // Refresh the current state of the accessory
      this.refreshAccessory(accessory)

      // If after five seconds the device hasn't responded then mark as offline
      setTimeout(() => {
        if (!accessory.context.isOnline && accessory.context.enableLogging) {
          this.log.warn('[%s] %s.', accessory.displayName, this.lang.repOffline)
        }
      }, 5000)
    } catch (err) {
      const eText = this.funcs.parseError(err, [this.lang.accNotFound])
      const dName = device.nick || device.did
      this.log.warn('[%s] %s %s.', dName, this.lang.devNotInit, eText)
    }
  }

  refreshAccessory (accessory) {
    try {
      // Check the device has initialised already
      if (!accessory.control) {
        return
      }

      // Setup a flag to check later if we have had a response
      accessory.context.hadResponse = false

      // Run the commands to get the state of the device
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetBatteryState].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetBatteryState')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetChargeState].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetChargeState')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetCleanState].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetCleanState')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetCleanSpeed].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetCleanSpeed')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetNetInfo].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetNetInfo')

      setTimeout(() => {
        if (!accessory.context.isOnline && accessory.context.hadResponse) {
          if (accessory.context.enableLogging) {
            this.log('[%s] %s.', accessory.displayName, this.lang.repOnline)
          }
          accessory.context.isOnline = true
          this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
          devicesInHB.set(accessory.UUID, accessory)
        }
        if (accessory.context.isOnline && !accessory.context.hadResponse) {
          if (accessory.context.enableLogging) {
            this.log.warn('[%s] %s.', accessory.displayName, this.lang.repOffline)
          }
          accessory.context.isOnline = false
          this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
          devicesInHB.set(accessory.UUID, accessory)
        }
      }, 5000)
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
      const accessory = new this.api.platformAccessory(
        displayName,
        this.api.hap.uuid.generate(device.vacuum.did)
      )
      accessory
        .getService(this.hapServ.AccessoryInformation)
        .setCharacteristic(this.hapChar.SerialNumber, device.vacuum.did)
        .setCharacteristic(this.hapChar.Manufacturer, device.vacuum.company)
        .setCharacteristic(this.hapChar.Model, device.deviceModel)
        .setCharacteristic(this.hapChar.Identify, true)

      // Add context information for Homebridge plugin-ui
      accessory.context.ecoDeviceId = device.vacuum.did
      accessory.context.ecoCompany = device.vacuum.company
      accessory.context.ecoModel = device.deviceModel
      accessory.context.ecoClass = device.vacuum.class
      accessory.context.ecoResource = device.vacuum.resource
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
      if (accessory.context.enableLogging) {
        const text = value ? this.lang.cleaning : this.lang.stop
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCleaning, text)
      }

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(this.lang.errNotInit)
      }
      if (!accessory.control.is_ready) {
        throw new Error(this.lang.errNotReady)
      }

      // Send the command
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.sendCmd, order)
      }
      accessory.control.run(order)
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err, [this.lang.errNotInit, this.lang.errNotReady])
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.cleanFail, eText)

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        accessory
          .getService('Clean')
          .updateCharacteristic(this.hapChar.On, accessory.cacheClean === 'auto')
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalSpeedUpdate (accessory, value) {
    try {
      // Set speed to max (3) if value is true otherwise set to standard (2)
      const command = value ? 3 : 2

      // Log the update if appropriate
      if (accessory.context.enableLogging) {
        const text = this.consts.speed2Label[command]
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.curSpeed, text)
      }

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(this.lang.errNotInit)
      }
      if (!accessory.control.is_ready) {
        throw new Error(this.lang.errNotReady)
      }

      // Send the command
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [SetCleanSpeed: %s].', accessory.displayName, this.lang.sendCmd, command)
      }
      accessory.control.run('SetCleanSpeed', command)
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err, [this.lang.errNotInit, this.lang.errNotReady])
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.speedFail, eText)

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        accessory
          .getService('Clean')
          .updateCharacteristic(this.cusChar.MaxSpeed, [3, 4].includes(accessory.cacheSpeed))
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalCommandUpdate (accessory, value) {
    try {
      // A value of 0 doesn't do anything
      if (value === 0) {
        return
      }

      // Avoid quick switching with this function
      const updateKey = Math.random()
        .toString(36)
        .substr(2, 8)
      accessory.context.lastCommandKey = updateKey
      await this.funcs.sleep(1000)
      if (updateKey !== accessory.context.lastCommandKey) {
        return
      }

      // Obtain the command from the device config
      const commandStr = this.deviceConf[accessory.context.ecoDeviceId]['command' + value]

      // Don't continue if no command for this number has been configured
      if (!commandStr) {
        return
      }

      // Log the update if appropriate
      if (accessory.context.enableLogging) {
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCommand, value)
      }

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(this.lang.errNotInit)
      }
      if (!accessory.control.is_ready) {
        throw new Error(this.lang.errNotReady)
      }

      // Obtain the sections of the command
      const commandArr = commandStr.split('/')

      // Send the command
      if (accessory.context.enableDebugLogging) {
        this.log(
          '[%s] %s [%s: %s].',
          accessory.displayName,
          this.lang.sendCmd,
          commandArr[0],
          commandArr[1]
        )
      }
      accessory.control.run(commandArr[0], 'start', commandArr[1])
      
      // Set the value back to 0 after two seconds
      setTimeout(() => {
        accessory.getService('Clean').updateCharacteristic(this.cusChar.Commands, 0)
      }, 2000)
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err, [this.lang.errNotInit, this.lang.errNotReady])
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.speedFail, eText)

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        accessory.getService('Clean').updateCharacteristic(this.cusChar.Commands, 0)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalChargeUpdate (accessory, value) {
    try {
      // A one second delay seems to make everything more responsive
      await this.funcs.sleep(1000)

      // Don't continue if the device is already charging
      const battService = accessory.getService(this.hapServ.Battery)
      if (battService.getCharacteristic(this.hapChar.ChargingState).value !== 0) {
        return
      }

      // Select the correct command to run, either start or stop going to charge
      const order = value ? 'Charge' : 'Stop'

      // Log the update if appropriate
      if (accessory.context.enableLogging) {
        const text = value ? this.lang.returning : this.lang.stop
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCharging, text)
      }

      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(this.lang.errNotInit)
      }
      if (!accessory.control.is_ready) {
        throw new Error(this.lang.errNotReady)
      }

      // Send the command
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.sendCmd, order)
      }
      accessory.control.run(order)
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err, [this.lang.errNotInit, this.lang.errNotReady])
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.chargeFail, eText)

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        accessory
          .getService('Go Charge')
          .updateCharacteristic(this.hapChar.On, accessory.cacheCharge === 'charging')
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  externalReadyUpdate (accessory, event) {
    try {
      // Called on the 'ready' event sent by the device so request update for states
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetBatteryState].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetBatteryState')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetChargeState].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetChargeState')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetCleanState].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetCleanState')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetCleanSpeed].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetCleanSpeed')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetNetInfo].', accessory.displayName, this.lang.sendCmd)
      }
      accessory.control.run('GetNetInfo')
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetMaps].', accessory.displayName, this.lang.sendCmd)
        accessory.control.run('GetMaps')
      }
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inRdyFail, eText)
    }
  }

  externalCleanUpdate (accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [CleanReport: %s].', accessory.displayName, this.lang.receiveCmd, newVal)
      }

      // Check if the new cleaning state is different from the cached state
      if (accessory.cacheClean !== newVal) {
        // State is different so update service
        accessory.getService('Clean').updateCharacteristic(this.hapChar.On, newVal === 'auto')

        // Log the change if appropriate
        if (accessory.context.enableLogging) {
          this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCleaning, newVal)
        }
      }

      // Always update the cache with the new cleaning status
      accessory.cacheClean = newVal
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inClnFail, eText)
    }
  }

  externalSpeedUpdate (accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [CleanSpeed: %s].', accessory.displayName, this.lang.receiveCmd, newVal)
      }

      // Check if the new cleaning state is different from the cached state
      if (accessory.cacheSpeed !== newVal) {
        // State is different so update service
        accessory
          .getService('Clean')
          .updateCharacteristic(this.cusChar.MaxSpeed, [3, 4].includes(newVal))

        // Log the change if appropriate
        if (accessory.context.enableLogging) {
          this.log(
            '[%s] %s [%s].',
            accessory.displayName,
            this.lang.curSpeed,
            this.consts.speed2Label[newVal]
          )
        }
      }

      // Always update the cache with the new speed status
      accessory.cacheSpeed = newVal
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inSpdFail, eText)
    }
  }

  externalChargeUpdate (accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [ChargeState: %s].', accessory.displayName, this.lang.receiveCmd, newVal)
      }

      // Check if the new charging state is different from the cached state
      if (accessory.cacheCharge !== newVal) {
        // State is different so update service
        accessory
          .getService('Go Charge')
          .updateCharacteristic(this.hapChar.On, newVal === 'returning')
        const chargeState = newVal === 'charging' ? 1 : 0
        accessory
          .getService(this.hapServ.Battery)
          .updateCharacteristic(this.hapChar.ChargingState, chargeState)

        // Log the change if appropriate
        if (accessory.context.enableLogging) {
          this.log('[%s] %s [%s].', accessory.displayName, this.lang.curCharging, newVal)
        }
      }

      // Always update the cache with the new charging status
      accessory.cacheCharge = newVal
    } catch (err) {
      // Catch any errors during the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inChgFail, eText)
    }
  }

  externalIPUpdate (accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [NetInfoIP: %s].', accessory.displayName, this.lang.receiveCmd, newVal)
      }

      // Check if the new IP is different from the cached IP
      if (accessory.context.ipAddress !== newVal) {
        // IP is different so update context info
        accessory.context.ipAddress = newVal

        // Update the changes to the accessory to the platform
        this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
        devicesInHB.set(accessory.UUID, accessory)
      }
    } catch (err) {
      // Catch any errors during the process
    }
  }

  externalMacUpdate (accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [NetInfoMAC: %s].', accessory.displayName, this.lang.receiveCmd, newVal)
      }

      // Check if the new MAC is different from the cached MAC
      if (accessory.context.macAddress !== newVal) {
        // MAC is different so update context info
        accessory.context.macAddress = newVal

        // Update the changes to the accessory to the platform
        this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
        devicesInHB.set(accessory.UUID, accessory)
      }
    } catch (err) {
      // Catch any errors during the process
    }
  }

  externalBatteryUpdate (accessory, newVal) {
    try {
      // Mark the device as online if it was offline before
      accessory.context.hadResponse = true

      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [BatteryInfo: %s].', accessory.displayName, this.lang.receiveCmd, newVal)
      }

      // Check the value given is between 0 and 100
      newVal = Math.min(Math.max(Math.round(newVal), 0), 100)

      // Check if the new battery value is different from the cached state
      if (accessory.cacheBattery !== newVal) {
        // Value is different so update services
        const threshold = this.deviceConf[accessory.context.ecoDeviceId].lowBattThreshold
        const lowBattStatus = newVal <= threshold ? 1 : 0
        accessory
          .getService(this.hapServ.Battery)
          .updateCharacteristic(this.hapChar.BatteryLevel, newVal)
        accessory
          .getService(this.hapServ.Battery)
          .updateCharacteristic(this.hapChar.StatusLowBattery, lowBattStatus)

        // Also update the 'battery' humidity service if it exists
        if (this.deviceConf[accessory.context.ecoDeviceId].showBattHumidity) {
          accessory
            .getService('Battery Level')
            .updateCharacteristic(this.hapChar.CurrentRelativeHumidity, newVal)
        }

        // Log the change if appropriate
        if (accessory.context.enableLogging) {
          this.log('[%s] %s [%s%].', accessory.displayName, this.lang.curBatt, newVal)
        }

        // If the user wants a message and a buzz from the motion sensor then do it
        if (
          this.deviceConf[accessory.context.ecoDeviceId].showMotionLowBatt &&
          newVal <= this.deviceConf[accessory.context.ecoDeviceId].lowBattThreshold &&
          !accessory.cacheShownMotionLowBatt
        ) {
          this.externalMessageUpdate(accessory, this.lang.lowBattMsg + newVal + '%')
          accessory.cacheShownMotionLowBatt = true
        }

        // Revert the cache to false once the device has charged above the threshold
        if (newVal > this.deviceConf[accessory.context.ecoDeviceId].lowBattThreshold) {
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
      // Don't bother logging the same message as before
      if (accessory.context.lastMsg === msg) {
        return
      }
      accessory.context.lastMsg = msg

      // Check if it's an no error message
      if (msg === 'NoError: Robot is operational') {
        return
      }

      // Check to see if the motion sensor is already in use
      if (accessory.cacheInUse) {
        return
      }
      accessory.cacheInUse = true

      // Log the message sent from the device
      if (accessory.context.enableLogging) {
        this.log('[%s] %s [%s].', accessory.displayName, this.lang.sentMsg, msg)
      }

      // Update the motion sensor to motion detected if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, true)
      }

      // The motion sensor stays on for the time configured by the user so we wait
      setTimeout(() => {
        // Reset the motion sensor after waiting for the time above if it exists
        if (accessory.getService('Attention')) {
          accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, false)
        }

        // Update the inUse cache to false as we are complete here
        accessory.cacheInUse = false
      }, this.deviceConf[accessory.context.ecoDeviceId].motionDuration * 1000)
    } catch (err) {
      // Catch any errors in the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inMsgFail, eText)
    }
  }

  async externalErrorUpdate (accessory, err) {
    try {
      // Check if it's an offline notification but device was online
      if (err === 'Recipient unavailable' && accessory.context.isOnline) {
        if (accessory.context.enableLogging) {
          this.log.warn('[%s] %s.', accessory.displayName, this.lang.repOffline)
        }
        accessory.context.isOnline = false
        this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
        devicesInHB.set(accessory.UUID, accessory)
      }

      // Don't bother logging the same message as before
      if (accessory.context.lastMsg === err) {
        return
      }
      accessory.context.lastMsg = err

      // Log the message sent from the device
      if (accessory.context.enableLogging) {
        this.log.warn('[%s] %s [%s].', accessory.displayName, this.lang.sentErr, err)
      }

      // Check to see if the motion sensor is already in use
      if (accessory.cacheInUse) {
        return
      }
      accessory.cacheInUse = true

      // Update the motion sensor to motion detected if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, true)
      }

      // The device has an error so turn both 'clean' and 'charge' switches off
      accessory.getService('Clean').updateCharacteristic(this.hapChar.On, false)
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false)

      // The motion sensor stays on for the time configured by the user so we wait
      setTimeout(() => {
        // Reset the motion sensor after waiting for the time above if it exists
        if (accessory.getService('Attention')) {
          accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, false)
        }

        // Update the inUse cache to false as we are complete here
        accessory.cacheInUse = false
      }, this.deviceConf[accessory.context.ecoDeviceId].motionDuration * 1000)
    } catch (err) {
      // Catch any errors in the process
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.inErrFail, eText)
    }
  }
}

// Export the plugin to Homebridge
module.exports = hb => hb.registerPlatform(plugin.alias, DeebotPlatform)
