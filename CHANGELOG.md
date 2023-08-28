# Change Log

All notable changes to homebridge-deebot will be documented in this file.

This project tries to adhere to [Semantic Versioning](http://semver.org/). In practice, this means that the version number will be incremented based on the following:

- `MAJOR` version when a minimum supported version of `homebridge` or `node` is increased to a new major version, or when a breaking change is made to the plugin config
- `MINOR` version when a new device type is added, or when a new feature is added that is backwards-compatible
- `PATCH` version when backwards-compatible bug fixes are implemented

## 6.1.1 (2023-08-28)

⚠️ Note this will be the last version of the plugin to support Node 16.
- Node 16 moves to 'end of life' on 2023-09-11 ([more info](https://nodejs.org/en/blog/announcements/nodejs16-eol))
- This is in-line with the Homebridge guidelines on supporting node versions ([more info](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js/))
- If you are currently using Node 16, now is a good time to upgrade to Node 18 or 20 (see the link above for more info)

### Changed

- Updated dependencies

## 6.1.0 (2023-08-10)

### Added

- Allow a polling interval to be set per accessory, or can be set to `0` to disable polling if the device supports push updates

### Changed

- Bump `ecovavs-deebot` library to v0.9.6-prerelease (thanks @mrbungle64!)
- Bump `node` recommended versions to v16.20.2 or v18.17.1 or v20.5.1

## 6.0.5 (2023-04-05)
## 6.0.4 (2023-04-05)
## 6.0.3 (2023-04-05)

### Changed

- Bump `ecovavs-deebot` library to v0.9.5 (thanks @mrbungle64!)
- Simplify log welcome messages

## 6.0.2 (2023-03-24)

### Changed

- Bump `ecovavs-deebot` library to v0.9.4 (thanks @mrbungle64!)

## 6.0.1 (2023-03-14)

### Fixed

- ` [GetNetInfo]` should be debug logging

## 6.0.0 (2023-03-11)

### Breaking

- Remove official support for Node 14
- Remove deprecated config options for old commands
- Remove option to disable plugin - this is now available in the Homebridge UI
- Remove option for debug logging - this will be enabled when using a beta version of the plugin
- Remove individual accessory logging options to simplify the config

### Changed

- Bump `ecovavs-deebot` library to v0.9.3 (thanks @mrbungle64!)
- Bump `node` recommended versions to v16.19.1 or v18.15.0

## 5.3.2 (2023-01-07)

### Changed

- Bump `ecovavs-deebot` library to v0.9.2 (pre-release)
- Bump `node` recommended versions to v14.21.2 or v16.19.0 or v18.13.0
- Bump `homebridge` recommended version to v1.6.0 or v2.0.0-beta

### Fixed

- Show correct service names for new accessories on new iOS version

## 5.3.1 (2022-11-27)

### Fixed

- A potential configuration issue when using multiple devices

## 5.3.0 (2022-11-24)

### Added

- Support for air drying (thanks [@apfelnutzer](https://github.com/apfelnutzer)!)
  - Switch can be hidden via the config if unwanted

### Changed

- Bump `ecovavs-deebot` library to v0.9.0
- Bump `node` recommended versions to v14.21.1 or v16.18.1 or v18.12.1

## 5.2.0 (2022-09-25)

### Added

- Support for cleaning coordinate areas (thanks [@apfelnutzer](https://github.com/apfelnutzer)!)

### Changed

- Correct parameters for `updatePlatformAccessories()`
- Existing custom areas have been renamed to Predefined Areas
- Bump `node` recommended versions to v14.20.1 or v16.17.1
- Updated dev dependencies

## 5.1.0 (2022-08-28)

### Added

- Updated `ecovacs-deebot` library to v0.8.3, notable changes:
  - Added initial support for yeedi login and also for a few models
    - yeedi k650
    - yeedi 2 hybrid
    - yeedi vac hybrid
    - yeedi mop station
    - Bumped canvas to 2.9.3

### Changed

- Bump `node` recommended versions to v14.20.0 or v16.17.0
- Bump `homebridge` recommended version to v1.5.0

## 5.0.5 (2022-06-08)

### Changed

- Bump `node` recommended versions to v14.19.3 or v16.15.1

### Fixed

- A potential issue showing errors in the logs

## 5.0.4 (2022-05-28)

### Changed

- More fixes and refactoring

## 5.0.3 (2022-05-28)

### Changed

- Bump `ecovacs-deebot` to v0.8.2

## 5.0.2 (2022-05-22)

### Changed

- Some refactoring

## 5.0.1 (2022-05-22)

### Changed

- Bump `node` recommended versions to v14.19.3 or v16.15.0
- Bump `ecovacs-deebot` to v0.8.1

## 5.0.0 (2022-05-07)

### Potentially Breaking Changes

⚠️ The minimum required version of Homebridge is now v1.4.0
⚠️ The minimum required version of Node is now v14

### Changed

- Changed to ESM package
- Bump `node` recommended versions to v14.19.1 or v16.14.2
- Bump `ecovacs-deebot` to v0.8.0

## 4.4.2 (2022-02-27)

### Changed

- Bump `node` recommended versions to v14.19.0 or v16.14.0
- Bump `homebridge` recommended version to v1.4.0
- Bump `ecovacs-deebot` to v0.7.2

## 4.4.1 (2022-01-15)

### Changed

- Bump `ecovacs-deebot` to v0.7.1
- Bump `node` recommended versions to v14.18.3 or v16.13.2

### Fixed

- Plugin crash for older versions of Homebridge

## 4.4.0 (2022-01-05)

### Added

- A further five custom areas bringing the total to fifteen

### Changed

- Plugin will log HAPNodeJS version on startup
- Bump `homebridge` recommended version to v1.3.9
- Updated dependencies

## 4.3.3 (2021-12-29)

### Changed

- Updated dependencies

## 4.3.2 (2021-12-26)

### Changed

- Updated dependencies

## 4.3.1 (2021-12-18)

### Added

- Accessory switches will show as 'No Response' until plugin has successfully initialised

### Changed

- Some config options rearranged for easier access
- More device info and device count logged on plugin initialisation
- Bump `ecovacs-deebot` to v0.7.0
- Bump `homebridge` recommended version to v1.3.8
- Bump `node` recommended versions to v14.18.2 or v16.13.1

## 4.2.7 (2021-10-03)

### Changed

- Updated dependencies

## 4.2.6 (2021-09-30)

### Changed

- Recommended node versions bumped to v14.18.0 or v16.10.0

## 4.2.5 (2021-09-09)

### Changed

- Updated `ecovacs-deebot` library to v0.6.8

## 4.2.4 (2021-09-09)

### Changed

- Updated `ecovacs-deebot` library to v0.6.7

## 4.2.3 (2021-09-09)

### Changed

- `configureAccessory` function simplified to reduce chance of accessory cache retrieval failing

## 4.2.2 (2021-09-05)

### Changed

- Updated `ecovacs-deebot` library to v0.6.6

## 4.2.1 (2021-09-02)

### Changed

- Updated `ecovacs-deebot` library to v0.6.5
- Recommended node version bumped to v14.17.6

## 4.2.0 (2021-08-30)

### Changed

- Ignore `Robot is operational` error in log
- Updated `ecovacs-deebot` library to v0.6.3
- Remove `node-machine-id` in favour of generating a client id based on ECOVACS username

## 4.1.0 (2021-08-30)

_Unpublished_

## 4.0.2 (2021-08-12)

### Changed

- **Platform Versions**
  - Recommended node version bumped to v14.17.5

### Fixed

- Attempt to fix a situation when `node-machine-id` fails to obtain the machine uuid

## 4.0.1 (2021-08-06)

### Changed

- Updated `ecovacs-deebot` library to v0.6.1

## 4.0.0 (2021-07-29)

### Added

- **Configuration**

  - Plugin will now check for duplicate device ID entries in the config and ignore them

### Changed

- ⚠️ **Platform Versions**

  - Recommended node version bumped to v14.17.4
  - Recommended homebridge version bumped to v1.3.4

## 3.4.0 (2021-07-22)

### Added

- Support for cleaning 'Spot Areas' customised in the ECOVACS app

## 3.3.1 (2021-07-18)

### Fixed

- Don't refresh accessory if it hasn't initialised properly

## 3.3.0 (2021-07-18)

### Changed

- **Homebridge UI**
  - `label` field now appears first in the device configuration sections
  - A device can now be ignored/removed from Homebridge by the `ignoreDevice` setting in the device configuration sections
- Plugin will now use HomeKit `Battery` service type instead of `BatteryService`

### Fixed

- Attempt to fix an accessory duplication issue ([#37](https://github.com/bwp91/homebridge-deebot/issues/37))

### Removed

- `ignoredDevices` configuration option (see alternate way of ignore a device above)

## 3.2.2 (2021-07-08)

### Changes

- Revert node version bump to v14.17.3 (back to v14.17.2)

## 3.2.1 (2021-07-07)

### Changed

- Startup logging 'housekeeping'

## 3.2.0 (2021-07-07)

### Added

- **Accessory Logging**
  - `overrideLogging` setting per device type, which can be set to (and will override the global device logging and debug logging settings):
    - `"default"` to follow the global device update and debug logging setting for this accessory (default if setting not set)
    - `"standard"` to enable device update logging but disable debug logging for this accessory
    - `"debug"` to enable device update and debug logging for this accessory
    - `"disable"` to disable device update and debug logging for this accessory
  - Device online and offline notifications will now be shown in the logs
- **Clean Speed**
  - Clean speed characteristic to choose between 'standard' and 'max' (this option is only available in the Eve app)
- **Plugin-UI**
  - Additional device info in the plugin-ui including online status, IP and MAC address if available

### Changed

- More interactive Homebridge UI - device configuration will expand once device ID entered
- Small changes to the startup logging
- Avoid repeated logging of the same device error message
- Update `ecovacs-deebot` library
- Use `standard-prettier` code formatting
- Recommended node version bump to v14.17.3

## 3.1.0 (2021-05-10)

### Added

- HomeKit 'No Response' messages when controlling a device fails for any reason
  - This 'No Response' status will be reverted after two seconds

### Changed

- Ensure user is using at least Homebridge v1.3.0

### Removed

- Removed `encodedPassword` config option
  - The plugin will now initially try the supplied password and if incorrect will attempt another login with a base64 decoded version

## 3.0.3 (2021-05-05)

### Fixed

- Fixes an issue where commands didn't send to the device properly

## 3.0.2 (2021-05-04)

### Changed

- Accessory 'identify' function will now add an entry to the log
- Backend refactoring, function and variable name changes

## 3.0.1 (2021-04-24)

### Requirements

- **Homebridge Users**
  - This plugin has a minimum requirement of Homebridge v1.3.3
- **HOOBS Users**
  - This plugin has a minimum requirement of HOOBS v3.3.4

### Added

- Configuration settings per Deebot device
- Support for Chinese server login
- Enter your ECOVACS password as a base64 encoded string and use the option `encodedPassword` to let the plugin know
- More viewable information in the Homebridge plugin-ui:
  - Device model, company and an image of your device in case you didn't know what it looked like

### Changed

- ⚠️ The plugin now uses a **per-device** configuration
  - Current device-specific configurations will cease to work until you update your settings
  - Refer to [the wiki](https://github.com/bwp91/homebridge-deebot/wiki/Configuration) for details regarding the new configuration
- Use the new `.onSet` methods available in Homebridge v1.3
- Modified config schema to show titles/descriptions for non Homebridge UI users
- Update wiki links in the Homebridge plugin-ui
- More welcome messages
- Recover accessories from the cache using the UUID
- Updated `ecovacs-deebot` depencendy to 0.6.0 ([changelog](https://github.com/mrbungle64/ecovacs-deebot.js/releases/tag/0.6.0))
- Updated `plugin-ui-utils` dependency
- Updated recommended Node to v14.16.1
- Updated README to reflect minimum supported Homebridge/HOOBS and Node versions

### Fixed

- Fixes an issue where the device name would not show in the logs if a device fails to initialise

## 2.8.5 (2021-02-11)

### Changed

- Link 'Uninstall' wiki page in the plugin-ui
- Updated minimum Homebridge to v1.1.7
- Updated minimum Node to v14.15.5

## 2.8.4 (2021-02-09)

### Changed

- Updated client dependency `ecovacs-deebot` to v0.5.6

## 2.8.3 (2021-02-08)

### Fixed

- Hide the `Config entry [plugin_map] is unused and can be removed` notice for HOOBS users

## 2.8.2 (2021-02-08)

### Fixed

- Fixes a bug when adding a device to Homebridge

## 2.8.1 (2021-02-08)

### Changed

- Error stack will be hidden when the disabled plugin message appears in the log

## 2.8.0 (2021-02-06)

### Added

- New setting `hideMotionSensor` if you want to completely hide the motion sensor
- Configuration checks to highlight any unnecessary settings you have
- Link to 'Configuration' wiki page in the plugin-ui

### Changed

- ⚠️ `ignoredDevices` configuration option is now an array not a string
- Motion sensor settings will hide from the Homebridge UI if the sensor is hidden
- Devices are now configured only after the plugin has initialised
- Error messages refactored to show the most useful information
- [Backend] Major code refactoring
- [Backend] Code comments

## 2.7.2 (2021-01-30)

### Changed

- Updated client dependency `ecovacs-deebot` to v0.5.5 which:
  - Added OZMO T5 and some more T8 models

## 2.7.1 (2021-01-29)

### Changed

- More consistent and clearer error logging
- Minor code refactors
- Updated plugin-ui-utils dep and use new method to get cached accessories

### Fixed

- Corrected the attempt to disconnect from devices on Homebridge shutdown

## 2.7.0 (2021-01-26)

### New

- New configuration option `showMotionLowBatt` which:
  - when `true` the motion sensor will activate when the Deebot's battery reaches the low battery threshold
  - the motion sensor will not activate again until the battery charged above the threshold and then fallen again

### Changed

- Default low battery status reduced from 20% to 15% to match Deebot's low battery alerts

## 2.6.3 (2021-01-23)

### Changed

- Backend - better handling of errors

## 2.6.2 (2021-01-20)

### Changed

- Updated dependencies

## 2.6.1 (2021-01-14)

### Changed

- Replaced `countryCode` selectbox with inputbox for responsiveness
- Support for all valid country codes
- Added CHANGELOG.md

## 2.6.0 (2021-01-12)

### New

- New configuration option `disableDeviceLogging` to stop device state changes being logged

### Changed

- Improved validation checks and formatting for user inputs
- Changes to startup log messages
- Backend code changes

### Removed

- Removal of maximum value for `number` types on plugin settings screen
