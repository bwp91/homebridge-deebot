/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class customCharacteristics {
  constructor (api) {
    this.hapServ = api.hap.Service
    this.hapChar = api.hap.Characteristic
    this.uuids = {
      maxSpeed: 'E963F001-079E-48FF-8F27-9C2605A29F52',
      customArea: 'E963F002-079E-48FF-8F27-9C2605A29F52'
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
    this.CustomArea = function () {
      self.hapChar.call(this, 'Custom Area', self.uuids.customArea)
      this.setProps({
        format: self.hapChar.Formats.UINT8,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.WRITE, self.hapChar.Perms.NOTIFY],
        minValue: 0,
        maxValue: 10,
        minStep: 1,
        validValues: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      })
      this.value = this.getDefaultValue()
    }
    const inherits = require('util').inherits
    inherits(this.MaxSpeed, this.hapChar)
    inherits(this.CustomArea, this.hapChar)
    this.MaxSpeed.UUID = this.uuids.maxSpeed
    this.CustomArea.UUID = this.uuids.customArea
  }
}
