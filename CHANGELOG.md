# Change Log

All notable changes to this homebridge-deebot will be documented in this file.

## BETA

### Added

* Configuration checks to highlight any unnecessary settings you have

### Changes

* ⚠️ `ignoredDevices` configuration option is now an array not a string
* Devices are now configured only after the plugin has initialised
* Error messages refactored to show the most useful information
* [Backend] Major code refactoring

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
