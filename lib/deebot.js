'use strict'
let Accessory, Characteristic, Service
const deebot = require('ecovacs-deebot')
const nodeMachineId = require('node-machine-id')
const promInterval = require('interval-promise')
const utils = require('./utils')
class Deebot {
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
    if (this.config.debugReqRes) {
      this.log.warn("Note: 'Request & Response Logging' is not advised for long-term use.")
    }
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
      const accessory = new Accessory(displayName, this.api.hap.uuid.generate(displayName).toString())
      accessory
        .getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.SerialNumber, device.vacuum.did)
        .setCharacteristic(Characteristic.Manufacturer, device.vacuum.company)
        .setCharacteristic(Characteristic.Model, device.deviceModel)
        .setCharacteristic(Characteristic.Identify, false)
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
      const cleanService = accessory.getService('Clean') || accessory.addService(Service.Switch, 'Clean', 'clean')
      const chargeService = accessory.getService('Go Charge') || accessory.addService(Service.Switch, 'Go Charge', 'gocharge')
      cleanService
        .getCharacteristic(Characteristic.On)
        .on('set', (value, callback) => this.internalCleanUpdate(accessory, value, callback))
      chargeService
        .getCharacteristic(Characteristic.On)
        .on('set', (value, callback) => this.internalChargeUpdate(accessory, value, callback))
      if (!accessory.getService('Attention')) {
        accessory.addService(Service.MotionSensor, 'Attention', 'attention')
      }
      if (!accessory.getService(Service.BatteryService)) {
        accessory.addService(Service.BatteryService)
      }
      if (!accessory.getService('Battery Level') && !this.config.hideBattHumidity) {
        accessory.addService(Service.HumiditySensor, 'Battery Level', 'batterylevel')
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
    await utils.sleep(1000)
    accessory.getService('Go Charge').updateCharacteristic(Characteristic.On, false)
    const order = value ? ['clean', 'auto'] : ['Stop']
    if (accessory.control) {
      if (accessory.control.is_ready) {
        accessory.control.run.apply(accessory.control, order)
      } else {
        accessory.control.orderToSend = order
        accessory.control.connect_and_wait_until_ready()
      }
    }
    await utils.sleep(2000)
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
    await utils.sleep(1000)
    if (!accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.ChargingState).value) {
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
    await utils.sleep(2000)
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
    const oldValue = accessory.getService(Service.BatteryService).getCharacteristic(Characteristic.BatteryLevel).value
    newValue = Math.round(newValue)
    if (newValue > 100) newValue = 100
    if (newValue < 0) newValue = 0
    if (oldValue !== newValue) {
      accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.BatteryLevel, newValue)
      accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.StatusLowBattery, newValue < 20)
      accessory.getService('Battery Level').updateCharacteristic(Characteristic.CurrentRelativeHumidity, newValue)
    }
    if (this.debug) {
      this.log('[%s] battery level updated to from [%s%] to [%s%].', accessory.displayName, oldValue, newValue)
    }
  }

  externalChargeUpdate (accessory, newStatus) {
    if (this.debug) {
      this.log('[%s] updated ChargeState status is [%s].', accessory.displayName, newStatus)
    }
    accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.ChargingState, newStatus === 'charging')
    accessory.getService('Go Charge').updateCharacteristic(Characteristic.On, newStatus === 'returning')
  }

  externalCleanUpdate (accessory, newStatus) {
    if (this.debug) {
      this.log('[%s] updated CleanReport status is [%s].', accessory.displayName, newStatus)
    }
    if (newStatus) {
      accessory.getService('Clean').updateCharacteristic(Characteristic.On, newStatus === 'auto')
    }
  }

  async externalMessageUpdate (accessory, msg) {
    if (accessory.context.inUse) return
    accessory.context.inUse = true
    this.log.warn('[%s] has sent a message - %s', accessory.displayName, msg)
    accessory.getService('Attention').getCharacteristic(Characteristic.MotionDetected, true)
    await utils.sleep(10000)
    accessory.getService('Attention').getCharacteristic(Characteristic.MotionDetected, false)
    accessory.context.inUse = false
  }

  async externalErrorUpdate (accessory, err) {
    if (accessory.context.inUse) return
    accessory.context.inUse = true
    this.log.warn('[%s] has sent an error message - %s.', accessory.displayName, err)
    accessory.getService('Attention').getCharacteristic(Characteristic.MotionDetected, true)
    accessory.getService('Clean').updateCharacteristic(Characteristic.On, false)
    accessory.getService('Go Charge').updateCharacteristic(Characteristic.On, false)
    await utils.sleep(10000)
    accessory.getService('Attention').getCharacteristic(Characteristic.MotionDetected, false)
    accessory.context.inUse = false
  }
}
module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  return Deebot
}
