<span align="center">
  
# homebridge-deebot 

 Homebridge plugin to control ECOVACS Deebot devices.
 
 [![Discord](https://img.shields.io/discord/432663330281226270?color=728ED5&logo=discord&label=discord)](https://discord.com/channels/432663330281226270/742733745743855627)
 [![npm](https://img.shields.io/npm/dt/homebridge-deebot)](https://www.npmjs.com/package/homebridge-deebot)   
 [![npm](https://img.shields.io/npm/v/homebridge-deebot/latest?label=release)](https://www.npmjs.com/package/homebridge-deebot)

</span>

### About


This package is a much simplified version of [homebridge-deebotEcovacs](https://github.com/nicoduj/homebridge-deebotEcovacs). If you are looking for more configurable options and different cleaning modes then [homebridge-deebotEcovacs](https://github.com/nicoduj/homebridge-deebotEcovacs) will be more appropriate for you.

This package will expose:
* A switch to turn auto cleaning mode on and off
* A switch to send your device back to the charging station
* A motion sensor to alert you if your device needs attention
* A battery service to alert you if your device's battery is low
* A humidity sensor service to show clearly the battery level % (humidity sensor is the best I can do :/)

This package:
* Does not require the canvas library unlike [homebridge-deebotEcovacs](https://github.com/nicoduj/homebridge-deebotEcovacs)
* Has only been tested with the N79 device (the device that I own)

Credit to [@nicoduj](https://github.com/nicoduj) for [homebridge-deebotEcovacs](https://github.com/nicoduj/homebridge-deebotEcovacs).
