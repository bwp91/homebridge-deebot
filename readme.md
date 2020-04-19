# homebridge-deebotecovacs

[![npm](https://img.shields.io/npm/v/homebridge-deebotecovacs.svg)](https://www.npmjs.com/package/homebridge-deebotecovacs)
[![npm](https://img.shields.io/npm/dw/homebridge-deebotecovacs.svg)](https://www.npmjs.com/package/homebridge-deebotecovacs)
[![npm](https://img.shields.io/npm/dt/homebridge-deebotecovacs.svg)](https://www.npmjs.com/package/homebridge-deebotecovacs)

[![CodeFactor](https://www.codefactor.io/repository/github/nicoduj/homebridge-deebotecovacs/badge)](https://www.codefactor.io/repository/github/nicoduj/homebridge-deebotecovacs)
[![Build Status](https://travis-ci.com/nicoduj/homebridge-deebotecovacs.svg?branch=master)](https://travis-ci.com/nicoduj/homebridge-deebotecovacs)
[![Known Vulnerabilities](https://snyk.io/test/github/nicoduj/homebridge-deebotecovacs/badge.svg?targetFile=package.json)](https://snyk.io/test/github/nicoduj/homebridge-deebotecovacs?targetFile=package.json)

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Plugin for controlling your [deebot Ecovacs](https://www.ecovacs.com/global/deebot-robotic-vacuum-cleaner) from [Ecovacs](https://www.ecovacs.com/global/support/) through [HomeBridge](https://github.com/nfarina/homebridge) .

Each Deebot is shown through one fan that will handle Start / Go to Charge function and spin when your deebot is cleaning.
The battery percentage / charging status is shown in the detail pane .

`npm install -g homebridge-deebotecovacs`

## Homebridge configuration

Config as below:

```json
"platforms": [
  {
    "platform": "HomebridgeDeebotEcovacs",
    "email": "toto@titi.com",
    "password": "toto",
    "countryCode" : "FR"
  }
]
```

Fields:

- `platform` must be "HomebridgeDeebotEcovacs" (required).
- `email` email used for your ecovacs account (required).
- `password` password of your ecovacs account (required).
- `country code` : country code for your account , value in : CH, TW, MY, JP, SG, TH, HK, IN, KR,US,FR, ES, UK, NO, MX, DE, PT, CH, AU, IT, NL, SE, BE, DK, OTHER (required).
- `refreshTimer` Optional - enable refresh of deebot state every X seconds, for automation purpose if you need to activate something else based on its state change (defaults : disable, accepted range : 30-600s).

## Changelog

See [CHANGELOG][].

[changelog]: CHANGELOG.md

## Inspiration

Many thanks to :

- [wpietri] for sucks python api and protocol
- [mrbungle64] for nice js port and revamp of sucks.js package
- every tester / contributor that test, and give feedback in any way !

[wpietri]: https://github.com/wpietri/sucks
[mrbungle64]: https://github.com/mrbungle64/ecovacs-deebot.js

## Donating

Support this project and [others by nicoduj][nicoduj-projects] via [PayPal][paypal-nicoduj].

[![Support via PayPal][paypal-button]][paypal-nicoduj]

[nicoduj-projects]: https://github.com/nicoduj/
[paypal-button]: https://img.shields.io/badge/Donate-PayPal-green.svg
[paypal-nicoduj]: https://www.paypal.me/nicoduj/

## License

As of Sept 01 2019, Nicolas Dujardin has released this repository and its contents to the public domain.

It has been released under the [UNLICENSE][].

[unlicense]: LICENSE
