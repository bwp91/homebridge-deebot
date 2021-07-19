/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class customCharacteristics {
  constructor (api) {
    this.hapServ = api.hap.Service
    this.hapChar = api.hap.Characteristic
    this.uuids = {
      maxSpeed: 'E963F001-079E-48FF-8F27-9C2605A29F52',
      commands: 'E963F002-079E-48FF-8F27-9C2605A29F52'
    }
    const self = this
    this.MaxSpeed = function () {
      self.hapChar.call(this, 'Max Speed', self.uuids.maxSpeed)
      this.setProps({
        format: self.hapChar.Formats.BOOL,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.WRITE, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.Commands = function () {
      self.hapChar.call(this, 'Custom Commands', self.uuids.commands)
      this.setProps({
        format: self.hapChar.Formats.UINT8,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.WRITE, self.hapChar.Perms.NOTIFY],
        minValue: 0,
        maxValue: 10
      })
      this.value = this.getDefaultValue()
    }
    const inherits = require('util').inherits
    inherits(this.MaxSpeed, this.hapChar)
    inherits(this.Commands, this.hapChar)
    this.MaxSpeed.UUID = this.uuids.maxSpeed
    this.Commands.UUID = this.uuids.commands
  }
}
