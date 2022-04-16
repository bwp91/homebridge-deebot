// Packages and constant variables for this class
import { createRequire } from 'module';
import { countries, EcoVacsAPI } from 'ecovacs-deebot';
import platformConsts from './utils/constants.js';
import platformChars from './utils/custom-chars.js';
import platformFuncs from './utils/functions.js';
import platformLang from './utils/lang-en.js';

const require = createRequire(import.meta.url);
const plugin = require('../package.json');

const devicesInHB = new Map();

// Create the platform class
export default class {
  constructor(log, config, api) {
    // Don't load the plugin if these aren't accessible for any reason
    if (!log || !api) {
      return;
    }

    // Begin plugin initialisation
    try {
      this.api = api;
      this.log = log;

      // Configuration objects for accessories
      this.deviceConf = {};
      this.ignoredDevices = [];

      // Make sure user is running Homebridge v1.4 or above
      if (!api.versionGreaterOrEqual || !api.versionGreaterOrEqual('1.4.0')) {
        throw new Error(platformLang.hbVersionFail);
      }

      // Check the user has configured the plugin
      if (!config) {
        throw new Error(platformLang.pluginNotConf);
      }

      // Log some environment info for debugging
      this.log(
        '%s v%s | Node %s | HB v%s | HAPNodeJS v%s...',
        platformLang.initialising,
        plugin.version,
        process.version,
        api.serverVersion,
        api.hap?.HAPLibraryVersion?.() || '?',
      );

      // Check the user has entered the required config fields
      if (!config.username || !config.password || !config.countryCode) {
        throw new Error(platformLang.missingCreds);
      }

      // Apply the user's configuration
      this.config = platformConsts.defaultConfig;
      this.applyUserConfig(config);

      // Create further variables needed by the plugin
      this.hapErr = api.hap.HapStatusError;
      this.hapChar = api.hap.Characteristic;
      this.hapServ = api.hap.Service;

      // Set up the Homebridge events
      this.api.on('didFinishLaunching', () => this.pluginSetup());
      this.api.on('shutdown', () => this.pluginShutdown());
    } catch (err) {
      // Catch any errors during initialisation
      const eText = platformFuncs.parseError(err, [
        platformLang.hbVersionFail,
        platformLang.pluginNotConf,
        platformLang.missingCreds,
        platformLang.invalidCCode,
        platformLang.invalidPassword,
        platformLang.invalidUsername,
      ]);
      log.warn('***** %s. *****', platformLang.disabling);
      log.warn('***** %s. *****', eText);
    }
  }

  applyUserConfig(config) {
    // These shorthand functions save line space during config parsing
    const logDefault = (k, def) => {
      this.log.warn('%s [%s] %s %s.', platformLang.cfgItem, k, platformLang.cfgDef, def);
    };
    const logDuplicate = (k) => {
      this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgDup);
    };
    const logIgnore = (k) => {
      this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgIgn);
    };
    const logIgnoreItem = (k) => {
      this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgIgnItem);
    };
    const logIncrease = (k, min) => {
      this.log.warn('%s [%s] %s %s.', platformLang.cfgItem, k, platformLang.cfgLow, min);
    };
    const logQuotes = (k) => {
      this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgQts);
    };
    const logRemove = (k) => {
      this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgRmv);
    };

    // Begin applying the user's config
    Object.entries(config).forEach((entry) => {
      const [key, val] = entry;
      switch (key) {
        case 'countryCode':
          if (typeof val !== 'string' || val === '') {
            throw new Error(platformLang.invalidCCode);
          }
          this.config.countryCode = val.toUpperCase().replace(/[^A-Z]+/g, '');
          if (!Object.keys(countries).includes(this.config.countryCode)) {
            throw new Error(platformLang.invalidCCode);
          }
          break;
        case 'debug':
        case 'disableDeviceLogging':
        case 'disablePlugin':
          if (typeof val === 'string') {
            logQuotes(key);
          }
          this.config[key] = val === 'false' ? false : !!val;
          break;
        case 'devices':
          if (Array.isArray(val) && val.length > 0) {
            val.forEach((x) => {
              if (!x.deviceId) {
                logIgnoreItem(key);
                return;
              }
              const id = x.deviceId.replace(/\s+/g, '');
              if (Object.keys(this.deviceConf).includes(id)) {
                logDuplicate(`${key}.${id}`);
                return;
              }
              const entries = Object.entries(x);
              if (entries.length === 1) {
                logRemove(`${key}.${id}`);
                return;
              }
              this.deviceConf[id] = platformConsts.defaultDevice;
              entries.forEach((subEntry) => {
                const [k, v] = subEntry;
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
                  case 'command10':
                  case 'command11':
                  case 'command12':
                  case 'command13':
                  case 'command14':
                  case 'command15': {
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(`${key}.${id}.${k}`);
                    } else {
                      const stripped = v.replace(/[^\d,]+/g, '');
                      if (stripped) {
                        this.deviceConf[id][k] = stripped;
                      } else {
                        logIgnore(`${key}.${id}.${k}`);
                      }
                    }
                    break;
                  }
                  case 'deviceId':
                  case 'label':
                    break;
                  case 'hideMotionSensor':
                  case 'showBattHumidity':
                  case 'showMotionLowBatt':
                    if (typeof v === 'string') {
                      logQuotes(`${key}.${id}.${k}`);
                    }
                    this.deviceConf[id][k] = v === 'false' ? false : !!v;
                    break;
                  case 'ignoreDevice':
                    if (typeof v === 'string') {
                      logQuotes(`${key}.${id}.${k}`);
                    }
                    if (!!v && v !== 'false') {
                      this.ignoredDevices.push(id);
                    }
                    break;
                  case 'lowBattThreshold':
                  case 'motionDuration': {
                    if (typeof v === 'string') {
                      logQuotes(`${key}.${id}.${k}`);
                    }
                    const intVal = parseInt(v, 10);
                    if (Number.isNaN(intVal)) {
                      logDefault(`${key}.${id}.${k}`, platformConsts.defaultValues[k]);
                      this.deviceConf[id][k] = platformConsts.defaultValues[k];
                    } else if (intVal < platformConsts.minValues[k]) {
                      logIncrease(`${key}.${id}.${k}`, platformConsts.minValues[k]);
                      this.deviceConf[id][k] = platformConsts.minValues[k];
                    } else {
                      this.deviceConf[id][k] = intVal;
                    }
                    break;
                  }
                  case 'overrideLogging': {
                    const inSet = platformConsts.allowed[k].includes(v);
                    if (typeof v !== 'string' || !inSet) {
                      logIgnore(`${key}.${id}.${k}`);
                    } else {
                      this.deviceConf[id][k] = inSet ? v : platformConsts.defaultValues[k];
                    }
                    break;
                  }
                  default:
                    logRemove(`${key}.${id}.${k}`);
                }
              });
            });
          } else {
            logIgnore(key);
          }
          break;
        case 'name':
        case 'platform':
        case 'plugin_map':
          break;
        case 'password':
          if (typeof val !== 'string' || val === '') {
            throw new Error(platformLang.invalidPassword);
          }
          this.config.password = val;
          break;
        case 'refreshTime': {
          if (typeof val === 'string') {
            logQuotes(key);
          }
          const intVal = parseInt(val, 10);
          if (Number.isNaN(intVal)) {
            logDefault(key, platformConsts.defaultValues[key]);
            this.config[key] = platformConsts.defaultValues[key];
          } else if (intVal < platformConsts.minValues[key]) {
            logIncrease(key, platformConsts.minValues[key]);
            this.config[key] = platformConsts.minValues[key];
          } else {
            this.config[key] = intVal;
          }
          break;
        }
        case 'username':
          if (typeof val !== 'string' || val === '') {
            throw new Error(platformLang.invalidUsername);
          }
          this.config.username = val.replace(/\s+/g, '');
          break;
        default:
          logRemove(key);
          break;
      }
    });
  }

  async pluginSetup() {
    // Plugin has finished initialising so now onto setup
    try {
      // If the user has disabled the plugin then remove all accessories
      if (this.config.disablePlugin) {
        devicesInHB.forEach((accessory) => this.removeAccessory(accessory));
        throw new Error(platformLang.disabled);
      }

      // Log that the plugin initialisation has been successful
      this.log('%s.', platformLang.initialised);

      this.cusChar = new platformChars(this.api);

      // Set up a (hopefully) constant uuid for the ecovacs-deebot client
      const nonce = this.api.hap.uuid.generate(this.config.username);

      // Connect to ECOVACS
      this.ecovacsAPI = new EcoVacsAPI(
        EcoVacsAPI.getDeviceId(nonce),
        this.config.countryCode,
        countries[this.config.countryCode].continent,
      );

      // Display version of the ecovacs-deebot library in the log
      this.log('%s v%s.', platformLang.ecovacsLibVersion, this.ecovacsAPI.getVersion());

      // Attempt to log in to ECOVACS
      try {
        await this.ecovacsAPI.connect(
          this.config.username,
          EcoVacsAPI.md5(this.config.password),
        );
      } catch (err) {
        // Check if password error and reattempt with base64 decoded version of password
        if (err.message?.includes('1010')) {
          this.config.password = Buffer.from(this.config.password, 'base64')
            .toString('utf8')
            .replace(/(\r\n|\n|\r)/gm, '')
            .trim();
          await this.ecovacsAPI.connect(
            this.config.username,
            EcoVacsAPI.md5(this.config.password),
          );
        } else {
          throw err;
        }
      }

      // Get a device list from ECOVACS
      const deviceList = await this.ecovacsAPI.devices();

      // Check the request for device list was successful
      if (!Array.isArray(deviceList)) {
        throw new Error(platformLang.deviceListFail);
      }

      // Initialise each device into Homebridge
      this.log('[%s] %s.', deviceList.length, platformLang.deviceCount);
      deviceList.forEach((device) => this.initialiseDevice(device));

      // Start the polling interval for device state refresh
      this.refreshInterval = setInterval(() => {
        devicesInHB.forEach((accessory) => this.refreshAccessory(accessory));
      }, this.config.refreshTime * 1000);

      // Log that the plugin setup has been successful with a welcome message
      const randIndex = Math.floor(Math.random() * platformLang.zWelcome.length);
      this.log('%s. %s', platformLang.complete, platformLang.zWelcome[randIndex]);
    } catch (err) {
      // Catch any errors during setup
      const eText = platformFuncs.parseError(err, [platformLang.disabled, platformLang.deviceListFail]);
      this.log.warn('***** %s. *****', platformLang.disabling);
      this.log.warn('***** %s. *****', eText);
      this.pluginShutdown();
    }
  }

  pluginShutdown() {
    // A function that is called when the plugin fails to load or Homebridge restarts
    try {
      // Stop the refresh interval
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }

      // Disconnect from each ECOVACS device
      devicesInHB.forEach((accessory) => {
        if (accessory.control?.is_ready) {
          accessory.control.disconnect();
        }
      });
    } catch (err) {
      // No need to show errors at this point
    }
  }

  initialiseDevice(device) {
    try {
      // Generate the Homebridge UUID from the device id
      const uuid = this.api.hap.uuid.generate(device.did);

      // If the accessory is in the ignored devices list then remove it
      if (this.ignoredDevices.includes(device.did)) {
        if (devicesInHB.has(uuid)) {
          this.removeAccessory(devicesInHB.get(uuid));
        }
        return;
      }

      // Obtain the user configuration for this device
      this.deviceConf[device.did] = this.deviceConf?.[device.did] || platformConsts.defaultDevice;

      // Load the device control information from ECOVACS
      const loadedDevice = this.ecovacsAPI.getVacBot(
        this.ecovacsAPI.uid,
        EcoVacsAPI.REALM,
        this.ecovacsAPI.resource,
        this.ecovacsAPI.user_access_token,
        device,
        countries[this.config.countryCode].continent,
      );

      // Get the cached accessory or add to Homebridge if it doesn't exist
      const accessory = devicesInHB.get(uuid) || this.addAccessory(loadedDevice);

      // Final check the accessory now exists in Homebridge
      if (!accessory) {
        throw new Error(platformLang.accNotFound);
      }

      // Add the user logging options to the context
      switch (this.deviceConf[device.did].overrideLogging) {
        case 'standard':
          accessory.context.enableLogging = true;
          accessory.context.enableDebugLogging = false;
          break;
        case 'debug':
          accessory.context.enableLogging = true;
          accessory.context.enableDebugLogging = true;
          break;
        case 'disable':
          accessory.context.enableLogging = false;
          accessory.context.enableDebugLogging = false;
          break;
        default:
          accessory.context.enableLogging = !this.config.disableDeviceLogging;
          accessory.context.enableDebugLogging = this.config.debug;
          break;
      }

      // Initially set the device online value to false (to be updated later)
      accessory.context.isOnline = false;
      accessory.context.lastMsg = '';

      // Add the 'clean' switch service if it doesn't already exist
      const cleanService = accessory.getService('Clean') || accessory.addService(this.hapServ.Switch, 'Clean', 'clean');

      // Add the 'charge' switch service if it doesn't already exist
      const chargeService = accessory.getService('Go Charge')
        || accessory.addService(this.hapServ.Switch, 'Go Charge', 'gocharge');

      // Check if the speed characteristic has been added
      if (!cleanService.testCharacteristic(this.cusChar.MaxSpeed)) {
        cleanService.addCharacteristic(this.cusChar.MaxSpeed);
      }

      // Add the Eve characteristic for custom commands if any exist
      if (this.deviceConf[device.did].command1) {
        if (!cleanService.testCharacteristic(this.cusChar.CustomArea)) {
          cleanService.addCharacteristic(this.cusChar.CustomArea);
        }

        // Add the set characteristic
        cleanService.getCharacteristic(this.cusChar.CustomArea).onSet(async (value) => {
          await this.internalCustomAreaUpdate(accessory, value);
        });
      } else if (cleanService.testCharacteristic(this.cusChar.CustomArea)) {
        cleanService.removeCharacteristic(cleanService.getCharacteristic(this.cusChar.CustomArea));
      }

      // Add the set handler to the 'clean' switch on/off characteristic
      cleanService
        .getCharacteristic(this.hapChar.On)
        .updateValue(accessory.context.cacheClean === 'auto')
        .removeOnSet()
        .onSet(async (value) => this.internalCleanUpdate(accessory, value));

      // Add the set handler to the 'max speed' switch on/off characteristic
      cleanService.getCharacteristic(this.cusChar.MaxSpeed)
        .onSet(async (value) => this.internalSpeedUpdate(accessory, value));

      // Add the set handler to the 'charge' switch on/off characteristic
      chargeService
        .getCharacteristic(this.hapChar.On)
        .updateValue(accessory.context.cacheCharge === 'charging')
        .removeOnSet()
        .onSet(async (value) => this.internalChargeUpdate(accessory, value));

      // Add the 'attention' motion service if it doesn't already exist
      if (!accessory.getService('Attention') && !this.deviceConf[device.did].hideMotionSensor) {
        accessory.addService(this.hapServ.MotionSensor, 'Attention', 'attention');
      }

      // Remove the 'attention' motion service if it exists and user doesn't want it
      if (accessory.getService('Attention') && this.deviceConf[device.did].hideMotionSensor) {
        accessory.removeService(accessory.getService('Attention'));
      }

      // Set the motion sensor off if exists when the plugin initially loads
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, false);
      }

      // Remove deprecated 'BatteryService' in favour of 'Battery'
      if (accessory.getService(this.hapServ.BatteryService)) {
        accessory.removeService(this.hapServ.BatteryService);
      }

      // Add the battery service if it doesn't already exist
      if (!accessory.getService(this.hapServ.Battery)) {
        accessory.addService(this.hapServ.Battery);
      }

      // Add the 'battery' humidity service if it doesn't already exist and user wants it
      if (!accessory.getService('Battery Level') && this.deviceConf[device.did].showBattHumidity) {
        accessory.addService(this.hapServ.HumiditySensor, 'Battery Level', 'batterylevel');
      }

      // Remove the 'battery' humidity service if it exists and user doesn't want it
      if (accessory.getService('Battery Level') && !this.deviceConf[device.did].showBattHumidity) {
        accessory.removeService(accessory.getService('Battery Level'));
      }

      // Save the device control information to the accessory
      accessory.control = loadedDevice;

      // Set up a listener for the device 'ready' event
      accessory.control.on('ready', (event) => {
        if (event) {
          this.externalReadyUpdate(accessory);
        }
      });

      // Set up a listener for the device 'CleanReport' event
      accessory.control.on('CleanReport', (newVal) => {
        if (newVal) {
          this.externalCleanUpdate(accessory, newVal);
        }
      });

      // Set up a listener for the device 'CleanSpeed' event
      accessory.control.on('CleanSpeed', (newVal) => {
        if (newVal) {
          this.externalSpeedUpdate(accessory, newVal);
        }
      });

      // Set up a listener for the device 'BatteryInfo' event
      accessory.control.on('BatteryInfo', async (newVal) => {
        if (newVal) {
          await this.externalBatteryUpdate(accessory, newVal);
        }
      });

      // Set up a listener for the device 'ChargeState' event
      accessory.control.on('ChargeState', (newVal) => {
        if (newVal) {
          this.externalChargeUpdate(accessory, newVal);
        }
      });

      // Set up a listener for the device 'NetInfoIP' event
      accessory.control.on('NetInfoIP', (newVal) => {
        if (newVal) {
          this.externalIPUpdate(accessory, newVal);
        }
      });

      // Set up a listener for the device 'NetInfoMAC' event
      accessory.control.on('NetInfoMAC', (newVal) => {
        if (newVal) {
          this.externalMacUpdate(accessory, newVal);
        }
      });

      // Set up a listener for the device 'message' event
      accessory.control.on('message', async (msg) => {
        if (msg) {
          await this.externalMessageUpdate(accessory, msg);
        }
      });

      // Set up a listener for the device 'Error' event
      accessory.control.on('Error', async (err) => {
        if (err) {
          await this.externalErrorUpdate(accessory, err);
        }
      });

      // Set up listeners for map data if accessory debug logging is on
      if (accessory.context.enableDebugLogging) {
        accessory.control.on('Maps', (maps) => {
          if (maps) {
            this.log('[%s] Maps: %s.', accessory.displayName, JSON.stringify(maps));
            Object.keys(maps.maps).forEach((key) => {
              accessory.control.run('GetSpotAreas', maps.maps[key].mapID);
              accessory.control.run('GetVirtualBoundaries', maps.maps[key].mapID);
            });
          }
        });

        accessory.control.on('MapSpotAreas', (spotAreas) => {
          if (spotAreas) {
            this.log('[%s] MapSpotAreas: %s.', accessory.displayName, JSON.stringify(spotAreas));
            Object.keys(spotAreas.mapSpotAreas).forEach((key) => {
              accessory.control.run(
                'GetSpotAreaInfo',
                spotAreas.mapID,
                spotAreas.mapSpotAreas[key].mapSpotAreaID,
              );
            });
          }
        });

        accessory.control.on('MapSpotAreaInfo', (area) => {
          if (area) {
            this.log('[%s] MapSpotAreaInfo: %s.', accessory.displayName, JSON.stringify(area));
          }
        });

        accessory.control.on('MapVirtualBoundaries', (vbs) => {
          if (vbs) {
            this.log('[%s] MapVirtualBoundaries: %s.', accessory.displayName, JSON.stringify(vbs));
            const vbsCombined = [...vbs.mapVirtualWalls, ...vbs.mapNoMopZones];
            const virtualBoundaryArray = [];
            Object.keys(vbsCombined).forEach((key) => {
              virtualBoundaryArray[vbsCombined[key].mapVirtualBoundaryID] = vbsCombined[key];
            });
            Object.keys(virtualBoundaryArray).forEach((key) => {
              accessory.control.run(
                'GetVirtualBoundaryInfo',
                vbs.mapID,
                virtualBoundaryArray[key].mapVirtualBoundaryID,
                virtualBoundaryArray[key].mapVirtualBoundaryType,
              );
            });
          }
        });

        accessory.control.on('MapVirtualBoundaryInfo', (vb) => {
          if (vb) {
            this.log('[%s] MapVirtualBoundaryInfo: %s.', accessory.displayName, JSON.stringify(vb));
          }
        });
      }

      // Connect to the device
      accessory.control.connect();

      // Update any changes to the accessory to the platform
      this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory]);
      devicesInHB.set(accessory.UUID, accessory);

      // Log configuration and device initialisation
      this.log(
        '[%s] %s: %s.',
        accessory.displayName,
        platformLang.devInitOpts,
        JSON.stringify(this.deviceConf[device.did]),
      );
      this.log(
        '[%s] %s [%s] %s %s.',
        accessory.displayName,
        platformLang.devInit,
        device.did,
        platformLang.addInfo,
        JSON.stringify(device),
      );

      // Refresh the current state of the accessory
      this.refreshAccessory(accessory);

      // If after five seconds the device hasn't responded then mark as offline
      setTimeout(() => {
        if (!accessory.context.isOnline && accessory.context.enableLogging) {
          this.log.warn('[%s] %s.', accessory.displayName, platformLang.repOffline);
        }
      }, 5000);
    } catch (err) {
      const eText = platformFuncs.parseError(err, [platformLang.accNotFound]);
      const dName = device.nick || device.did;
      this.log.warn('[%s] %s %s.', dName, platformLang.devNotInit, eText);
      this.log.warn(err);
    }
  }

  refreshAccessory(accessory) {
    try {
      // Check the device has initialised already
      if (!accessory.control) {
        return;
      }

      // Set up a flag to check later if we have had a response
      accessory.context.hadResponse = false;

      // Run the commands to get the state of the device
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetBatteryState].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetBatteryState');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetChargeState].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetChargeState');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetCleanState].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetCleanState');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetCleanSpeed].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetCleanSpeed');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetNetInfo].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetNetInfo');

      setTimeout(() => {
        if (!accessory.context.isOnline && accessory.context.hadResponse) {
          if (accessory.context.enableLogging) {
            this.log('[%s] %s.', accessory.displayName, platformLang.repOnline);
          }
          accessory.context.isOnline = true;
          this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory]);
          devicesInHB.set(accessory.UUID, accessory);
        }
        if (accessory.context.isOnline && !accessory.context.hadResponse) {
          if (accessory.context.enableLogging) {
            this.log.warn('[%s] %s.', accessory.displayName, platformLang.repOffline);
          }
          accessory.context.isOnline = false;
          this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory]);
          devicesInHB.set(accessory.UUID, accessory);
        }
      }, 5000);
    } catch (err) {
      // Catch any errors in the refresh process
      const eText = platformFuncs.parseError(err);
      const name = accessory.displayName;
      this.log.warn('[%s] %s %s.', name, platformLang.devNotRef, eText);
    }
  }

  addAccessory(device) {
    // Add an accessory to Homebridge
    let displayName = 'Unknown';
    try {
      displayName = device.vacuum.nick || device.vacuum.did;
      const accessory = new this.api.platformAccessory(
        displayName,
        this.api.hap.uuid.generate(device.vacuum.did),
      );
      accessory
        .getService(this.hapServ.AccessoryInformation)
        .setCharacteristic(this.hapChar.Name, displayName)
        .setCharacteristic(this.hapChar.ConfiguredName, displayName)
        .setCharacteristic(this.hapChar.SerialNumber, device.vacuum.did)
        .setCharacteristic(this.hapChar.Manufacturer, device.vacuum.company)
        .setCharacteristic(this.hapChar.Model, device.deviceModel)
        .setCharacteristic(this.hapChar.Identify, true);

      // Add context information for Homebridge plugin-ui
      accessory.context.ecoDeviceId = device.vacuum.did;
      accessory.context.ecoCompany = device.vacuum.company;
      accessory.context.ecoModel = device.deviceModel;
      accessory.context.ecoClass = device.vacuum.class;
      accessory.context.ecoResource = device.vacuum.resource;
      accessory.context.ecoImage = device.deviceImageURL;
      this.api.registerPlatformAccessories(plugin.name, plugin.alias, [accessory]);
      devicesInHB.set(accessory.UUID, accessory);
      this.log('[%s] %s.', displayName, platformLang.devAdd);
      return accessory;
    } catch (err) {
      // Catch any errors during add
      const eText = platformFuncs.parseError(err);
      this.log.warn('[%s] %s %s.', displayName, platformLang.devNotAdd, eText);
      return false;
    }
  }

  configureAccessory(accessory) {
    // Add the configured accessory to our global map
    devicesInHB.set(accessory.UUID, accessory);
    accessory
      .getService('Clean')
      .getCharacteristic(this.api.hap.Characteristic.On)
      .onSet(() => {
        this.log.warn('[%s] %s.', accessory.displayName, platformLang.accNotReady);
        throw new this.api.hap.HapStatusError(-70402);
      })
      .updateValue(new this.api.hap.HapStatusError(-70402));
    accessory
      .getService('Go Charge')
      .getCharacteristic(this.api.hap.Characteristic.On)
      .onSet(() => {
        this.log.warn('[%s] %s.', accessory.displayName, platformLang.accNotReady);
        throw new this.api.hap.HapStatusError(-70402);
      })
      .updateValue(new this.api.hap.HapStatusError(-70402));
  }

  removeAccessory(accessory) {
    // Remove an accessory from Homebridge
    try {
      this.api.unregisterPlatformAccessories(plugin.name, plugin.alias, [accessory]);
      devicesInHB.delete(accessory.UUID);
      this.log('[%s] %s.', accessory.displayName, platformLang.devRemove);
    } catch (err) {
      // Catch any errors during remove
      const eText = platformFuncs.parseError(err);
      const name = accessory.displayName;
      this.log.warn('[%s] %s %s.', name, platformLang.devNotRemove, eText);
    }
  }

  async internalCleanUpdate(accessory, value) {
    try {
      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(platformLang.errNotInit);
      }
      if (!accessory.control.is_ready) {
        throw new Error(platformLang.errNotReady);
      }

      // A one-second delay seems to make turning off the 'charge' switch more responsive
      await platformFuncs.sleep(1000);

      // Turn the 'charge' switch off since we have commanded the 'clean' switch
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false);

      // Select the correct command to run, either start or stop cleaning
      const order = value ? 'Clean' : 'Stop';

      // Log the update if appropriate
      if (accessory.context.enableLogging) {
        const text = value ? platformLang.cleaning : platformLang.stop;
        this.log('[%s] %s [%s].', accessory.displayName, platformLang.curCleaning, text);
      }

      // Send the command
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [%s].', accessory.displayName, platformLang.sendCmd, order);
      }
      accessory.control.run(order);
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err, [platformLang.errNotInit, platformLang.errNotReady]);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.cleanFail, eText);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        accessory
          .getService('Clean')
          .updateCharacteristic(this.hapChar.On, accessory.context.cacheClean === 'auto');
      }, 2000);
      throw new this.hapErr(-70402);
    }
  }

  async internalSpeedUpdate(accessory, value) {
    try {
      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(platformLang.errNotInit);
      }
      if (!accessory.control.is_ready) {
        throw new Error(platformLang.errNotReady);
      }

      // Set speed to max (3) if value is true otherwise set to standard (2)
      const command = value ? 3 : 2;

      // Log the update if appropriate
      if (accessory.context.enableLogging) {
        const text = platformConsts.speed2Label[command];
        this.log('[%s] %s [%s].', accessory.displayName, platformLang.curSpeed, text);
      }

      // Send the command
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [SetCleanSpeed: %s].', accessory.displayName, platformLang.sendCmd, command);
      }
      accessory.control.run('SetCleanSpeed', command);
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err, [platformLang.errNotInit, platformLang.errNotReady]);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.speedFail, eText);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        accessory
          .getService('Clean')
          .updateCharacteristic(this.cusChar.MaxSpeed, [3, 4].includes(accessory.cacheSpeed));
      }, 2000);
      throw new this.hapErr(-70402);
    }
  }

  async internalCustomAreaUpdate(accessory, value) {
    try {
      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(platformLang.errNotInit);
      }
      if (!accessory.control.is_ready) {
        throw new Error(platformLang.errNotReady);
      }

      // Eve app for some reason still sends values with decimal places
      value = Math.round(value);

      // A value of 0 doesn't do anything
      if (value === 0) {
        return;
      }

      // Avoid quick switching with this function
      const updateKey = Math.random()
        .toString(36)
        .substr(2, 8);
      accessory.context.lastCommandKey = updateKey;
      await platformFuncs.sleep(1000);
      if (updateKey !== accessory.context.lastCommandKey) {
        return;
      }

      // Obtain the command from the device config
      const command = this.deviceConf[accessory.context.ecoDeviceId][`command${value}`];

      // Don't continue if no command for this number has been configured
      if (!command) {
        return;
      }

      // Log the update if appropriate
      if (accessory.context.enableLogging) {
        this.log('[%s] %s [%s].', accessory.displayName, platformLang.curArea, value);
      }

      // Send the command
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [SpotArea: %s].', accessory.displayName, platformLang.sendCmd, command);
      }
      accessory.control.run('SpotArea', 'start', command);

      // Set the value back to 0 after two seconds and turn the main ON switch on
      setTimeout(() => {
        accessory.getService('Clean').updateCharacteristic(this.cusChar.CustomArea, 0);
        accessory.getService('Clean').updateCharacteristic(this.hapChar.On, true);
      }, 2000);
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err, [platformLang.errNotInit, platformLang.errNotReady]);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.speedFail, eText);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        accessory.getService('Clean').updateCharacteristic(this.cusChar.CustomArea, 0);
      }, 2000);
      throw new this.hapErr(-70402);
    }
  }

  async internalChargeUpdate(accessory, value) {
    try {
      // Don't continue if we can't send commands to the device
      if (!accessory.control) {
        throw new Error(platformLang.errNotInit);
      }
      if (!accessory.control.is_ready) {
        throw new Error(platformLang.errNotReady);
      }

      // A one-second delay seems to make everything more responsive
      await platformFuncs.sleep(1000);

      // Don't continue if the device is already charging
      const battService = accessory.getService(this.hapServ.Battery);
      if (battService.getCharacteristic(this.hapChar.ChargingState).value !== 0) {
        return;
      }

      // Select the correct command to run, either start or stop going to charge
      const order = value ? 'Charge' : 'Stop';

      // Log the update if appropriate
      if (accessory.context.enableLogging) {
        const text = value ? platformLang.returning : platformLang.stop;
        this.log('[%s] %s [%s].', accessory.displayName, platformLang.curCharging, text);
      }

      // Send the command
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [%s].', accessory.displayName, platformLang.sendCmd, order);
      }
      accessory.control.run(order);
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err, [platformLang.errNotInit, platformLang.errNotReady]);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.chargeFail, eText);

      // Throw a 'no response' error and set a timeout to revert this after 2 seconds
      setTimeout(() => {
        accessory
          .getService('Go Charge')
          .updateCharacteristic(this.hapChar.On, accessory.context.cacheCharge === 'charging');
      }, 2000);
      throw new this.hapErr(-70402);
    }
  }

  externalReadyUpdate(accessory) {
    try {
      // Called on the 'ready' event sent by the device so request update for states
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetBatteryState].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetBatteryState');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetChargeState].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetChargeState');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetCleanState].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetCleanState');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetCleanSpeed].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetCleanSpeed');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetNetInfo].', accessory.displayName, platformLang.sendCmd);
      }
      accessory.control.run('GetNetInfo');
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [GetMaps].', accessory.displayName, platformLang.sendCmd);
        accessory.control.run('GetMaps');
      }
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.inRdyFail, eText);
    }
  }

  externalCleanUpdate(accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [CleanReport: %s].', accessory.displayName, platformLang.receiveCmd, newVal);
      }

      // Check if the new cleaning state is different from the cached state
      if (accessory.context.cacheClean !== newVal) {
        // State is different so update service
        accessory
          .getService('Clean')
          .updateCharacteristic(
            this.hapChar.On,
            ['auto', 'clean', 'edge', 'spot', 'spotarea', 'customarea'].includes(
              newVal.toLowerCase().replace(/[^a-z]+/g, ''),
            ),
          );

        // Log the change if appropriate
        if (accessory.context.enableLogging) {
          this.log('[%s] %s [%s].', accessory.displayName, platformLang.curCleaning, newVal);
        }
      }

      // Always update the cache with the new cleaning status
      accessory.context.cacheClean = newVal;
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.inClnFail, eText);
    }
  }

  externalSpeedUpdate(accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [CleanSpeed: %s].', accessory.displayName, platformLang.receiveCmd, newVal);
      }

      // Check if the new cleaning state is different from the cached state
      if (accessory.cacheSpeed !== newVal) {
        // State is different so update service
        accessory
          .getService('Clean')
          .updateCharacteristic(this.cusChar.MaxSpeed, [3, 4].includes(newVal));

        // Log the change if appropriate
        if (accessory.context.enableLogging) {
          this.log(
            '[%s] %s [%s].',
            accessory.displayName,
            platformLang.curSpeed,
            platformConsts.speed2Label[newVal],
          );
        }
      }

      // Always update the cache with the new speed status
      accessory.cacheSpeed = newVal;
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.inSpdFail, eText);
    }
  }

  externalChargeUpdate(accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [ChargeState: %s].', accessory.displayName, platformLang.receiveCmd, newVal);
      }

      // Check if the new charging state is different from the cached state
      if (accessory.context.cacheCharge !== newVal) {
        // State is different so update service
        accessory
          .getService('Go Charge')
          .updateCharacteristic(this.hapChar.On, newVal === 'returning');
        const chargeState = newVal === 'charging' ? 1 : 0;
        accessory
          .getService(this.hapServ.Battery)
          .updateCharacteristic(this.hapChar.ChargingState, chargeState);

        // Log the change if appropriate
        if (accessory.context.enableLogging) {
          this.log('[%s] %s [%s].', accessory.displayName, platformLang.curCharging, newVal);
        }
      }

      // Always update the cache with the new charging status
      accessory.context.cacheCharge = newVal;
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.inChgFail, eText);
    }
  }

  externalIPUpdate(accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [NetInfoIP: %s].', accessory.displayName, platformLang.receiveCmd, newVal);
      }

      // Check if the new IP is different from the cached IP
      if (accessory.context.ipAddress !== newVal) {
        // IP is different so update context info
        accessory.context.ipAddress = newVal;

        // Update the changes to the accessory to the platform
        this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory]);
        devicesInHB.set(accessory.UUID, accessory);
      }
    } catch (err) {
      // Catch any errors during the process
    }
  }

  externalMacUpdate(accessory, newVal) {
    try {
      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [NetInfoMAC: %s].', accessory.displayName, platformLang.receiveCmd, newVal);
      }

      // Check if the new MAC is different from the cached MAC
      if (accessory.context.macAddress !== newVal) {
        // MAC is different so update context info
        accessory.context.macAddress = newVal;

        // Update the changes to the accessory to the platform
        this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory]);
        devicesInHB.set(accessory.UUID, accessory);
      }
    } catch (err) {
      // Catch any errors during the process
    }
  }

  async externalBatteryUpdate(accessory, newVal) {
    try {
      // Mark the device as online if it was offline before
      accessory.context.hadResponse = true;

      // Log the received update if enabled
      if (accessory.context.enableDebugLogging) {
        this.log('[%s] %s [BatteryInfo: %s].', accessory.displayName, platformLang.receiveCmd, newVal);
      }

      // Check the value given is between 0 and 100
      newVal = Math.min(Math.max(Math.round(newVal), 0), 100);

      // Check if the new battery value is different from the cached state
      if (accessory.cacheBattery !== newVal) {
        // Value is different so update services
        const threshold = this.deviceConf[accessory.context.ecoDeviceId].lowBattThreshold;
        const lowBattStatus = newVal <= threshold ? 1 : 0;
        accessory
          .getService(this.hapServ.Battery)
          .updateCharacteristic(this.hapChar.BatteryLevel, newVal);
        accessory
          .getService(this.hapServ.Battery)
          .updateCharacteristic(this.hapChar.StatusLowBattery, lowBattStatus);

        // Also update the 'battery' humidity service if it exists
        if (this.deviceConf[accessory.context.ecoDeviceId].showBattHumidity) {
          accessory
            .getService('Battery Level')
            .updateCharacteristic(this.hapChar.CurrentRelativeHumidity, newVal);
        }

        // Log the change if appropriate
        if (accessory.context.enableLogging) {
          this.log('[%s] %s [%s%].', accessory.displayName, platformLang.curBatt, newVal);
        }

        // If the user wants a message and a buzz from the motion sensor then do it
        if (
          this.deviceConf[accessory.context.ecoDeviceId].showMotionLowBatt
          && newVal <= this.deviceConf[accessory.context.ecoDeviceId].lowBattThreshold
          && !accessory.cacheShownMotionLowBatt
        ) {
          await this.externalMessageUpdate(accessory, `${platformLang.lowBattMsg + newVal}%`);
          accessory.cacheShownMotionLowBatt = true;
        }

        // Revert the cache to false once the device has charged above the threshold
        if (newVal > this.deviceConf[accessory.context.ecoDeviceId].lowBattThreshold) {
          accessory.cacheShownMotionLowBatt = false;
        }
      }

      // Always update the cache with the new battery value
      accessory.cacheBattery = newVal;
    } catch (err) {
      // Catch any errors during the process
      const eText = platformFuncs.parseError(err);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.inBattFail, eText);
    }
  }

  async externalMessageUpdate(accessory, msg) {
    try {
      // Don't bother logging the same message as before
      if (accessory.context.lastMsg === msg) {
        return;
      }
      accessory.context.lastMsg = msg;

      // Check if it's a no error message
      if (msg === 'NoError: Robot is operational') {
        return;
      }

      // Check to see if the motion sensor is already in use
      if (accessory.cacheInUse) {
        return;
      }
      accessory.cacheInUse = true;

      // Log the message sent from the device
      if (accessory.context.enableLogging) {
        this.log('[%s] %s [%s].', accessory.displayName, platformLang.sentMsg, msg);
      }

      // Update the motion sensor to motion detected if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, true);
      }

      // The motion sensor stays on for the time configured by the user, so we wait
      setTimeout(() => {
        // Reset the motion sensor after waiting for the time above if it exists
        if (accessory.getService('Attention')) {
          accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, false);
        }

        // Update the inUse cache to false as we are complete here
        accessory.cacheInUse = false;
      }, this.deviceConf[accessory.context.ecoDeviceId].motionDuration * 1000);
    } catch (err) {
      // Catch any errors in the process
      const eText = platformFuncs.parseError(err);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.inMsgFail, eText);
    }
  }

  async externalErrorUpdate(accessory, err) {
    try {
      // Check if it's an offline notification but device was online
      if (err === 'Recipient unavailable' && accessory.context.isOnline) {
        if (accessory.context.enableLogging) {
          this.log.warn('[%s] %s.', accessory.displayName, platformLang.repOffline);
        }
        accessory.context.isOnline = false;
        this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory]);
        devicesInHB.set(accessory.UUID, accessory);
      }

      // Check if it's a no error message
      if (err === 'NoError: Robot is operational') {
        return;
      }

      // Don't bother logging the same message as before
      if (accessory.context.lastMsg === err) {
        return;
      }
      accessory.context.lastMsg = err;

      // Log the message sent from the device
      if (accessory.context.enableLogging) {
        this.log.warn('[%s] %s [%s].', accessory.displayName, platformLang.sentErr, err);
      }

      // Check to see if the motion sensor is already in use
      if (accessory.cacheInUse) {
        return;
      }
      accessory.cacheInUse = true;

      // Update the motion sensor to motion detected if it exists
      if (accessory.getService('Attention')) {
        accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, true);
      }

      // The device has an error so turn both 'clean' and 'charge' switches off
      accessory.getService('Clean').updateCharacteristic(this.hapChar.On, false);
      accessory.getService('Go Charge').updateCharacteristic(this.hapChar.On, false);

      // The motion sensor stays on for the time configured by the user, so we wait
      setTimeout(() => {
        // Reset the motion sensor after waiting for the time above if it exists
        if (accessory.getService('Attention')) {
          accessory.getService('Attention').updateCharacteristic(this.hapChar.MotionDetected, false);
        }

        // Update the inUse cache to false as we are complete here
        accessory.cacheInUse = false;
      }, this.deviceConf[accessory.context.ecoDeviceId].motionDuration * 1000);
    } catch (error) {
      // Catch any errors in the process
      const eText = platformFuncs.parseError(error);
      this.log.warn('[%s] %s %s.', accessory.displayName, platformLang.inErrFail, eText);
    }
  }
}
