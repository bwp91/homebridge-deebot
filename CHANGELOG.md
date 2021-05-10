# Change Log

All notable changes to this homebridge-deebot will be documented in this file.

## BETA

### Added

* HomeKit 'No Response' messages when controlling a device fails for any reason
  * This 'No Response' status will be reverted after two seconds

### Changes

* Removed `encodedPassword` config option
  * The plugin will now initially try the supplied password and if incorrect will attempt another login with a base64 decoded version
* Ensure user is using at least Homebridge v1.3.0

## 3.0.3 (2021-05-05)

### Changes

* Fixes an issue where commands didn't send to the device properly

## 3.0.2 (2021-05-04)

### Changes

* Accessory 'identify' function will now add an entry to the log
* Backend refactoring, function and variable name changes

## 3.0.1 (2021-04-24)

### Requirements

* **Homebridge Users**
  * This plugin has a minimum requirement of Homebridge v1.3.3

* **HOOBS Users**
  * This plugin has a minimum requirement of HOOBS v3.3.4

### ⚠️ Breaking Change

* The plugin now uses a **per-device** configuration
  * Current device-specific configurations will cease to work until you update your settings
  * Refer to [the wiki](https://github.com/bwp91/homebridge-deebot/wiki/Configuration) for details regarding the new configuration

### Added

* Configuration settings per Deebot device
* Support for Chinese server login
* Enter your ECOVACS password as a base64 encoded string and use the option `encodedPassword` to let the plugin know
* More viewable information in the Homebridge plugin-ui:
  * Device model, company and an image of your device in case you didn't know what it looked like

### Changes

* Use the new `.onSet` methods available in Homebridge v1.3
* Modified config schema to show titles/descriptions for non Homebridge UI users
* Fixes an issue where the device name would not show in the logs if a device fails to initialise
* Update wiki links in the Homebridge plugin-ui
* More welcome messages
* Recover accessories from the cache using the UUID
* Updated `ecovacs-deebot` depencendy to 0.6.0 ([changelog](https://github.com/mrbungle64/ecovacs-deebot.js/releases/tag/0.6.0))
* Updated `plugin-ui-utils` dependency
* Updated recommended Node to v14.16.1
* Updated README to reflect minimum supported Homebridge/HOOBS and Node versions

## 2.8.5 (2021-02-11)

### Changes

* Link 'Uninstall' wiki page in the plugin-ui
* Updated minimum Homebridge to v1.1.7
* Updated minimum Node to v14.15.5

## 2.8.4 (2021-02-09)

### Changes

* Updated client dependency `ecovacs-deebot` to v0.5.6

## 2.8.3 (2021-02-08)

### Changes

* Hide the `Config entry [plugin_map] is unused and can be removed` notice for HOOBS users

## 2.8.2 (2021-02-08)

### Changes

* Fixes a bug when adding a device to Homebridge

## 2.8.1 (2021-02-08)

### Changes

* Error stack will be hidden when the disabled plugin message appears in the log

## 2.8.0 (2021-02-06)

### Added

* New setting `hideMotionSensor` if you want to completely hide the motion sensor
* Configuration checks to highlight any unnecessary settings you have
* Link to 'Configuration' wiki page in the plugin-ui

### Changes

* ⚠️ `ignoredDevices` configuration option is now an array not a string
* Motion sensor settings will hide from the Homebridge UI if the sensor is hidden
* Devices are now configured only after the plugin has initialised
* Error messages refactored to show the most useful information
* [Backend] Major code refactoring
* [Backend] Code comments

## 2.7.2 (2021-01-30)

### Changes

* Updated client dependency `ecovacs-deebot` to v0.5.5 which:
  * Added OZMO T5 and some more T8 models

## 2.7.1 (2021-01-29)

### Changes

* Corrected the attempt to disconnect from devices on Homebridge shutdown
* More consistent and clearer error logging
* Minor code refactors
* Updated plugin-ui-utils dep and use new method to get cached accessories

## 2.7.0 (2021-01-26)

### New

* New configuration option `showMotionLowBatt` which:
  * when `true` the motion sensor will activate when the Deebot's battery reaches the low battery threshold
  * the motion sensor will not activate again until the battery charged above the threshold and then fallen again

### Changes

* Default low battery status reduced from 20% to 15% to match Deebot's low battery alerts

## 2.6.3 (2021-01-23)

### Changes

* Backend - better handling of errors

## 2.6.2 (2021-01-20)

### Changes

* Updated dependencies

## 2.6.1 (2021-01-14)

### Changes

* Replaced `countryCode` selectbox with inputbox for responsiveness
* Support for all valid country codes
* Added CHANGELOG.md

## 2.6.0 (2021-01-12)

### New
* New configuration option `disableDeviceLogging` to stop device state changes being logged

### Changes
* Improved validation checks and formatting for user inputs
* Removal of maximum value for `number` types on plugin settings screen
* Changes to startup log messages
* Backend code changes
