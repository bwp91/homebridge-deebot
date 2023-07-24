import { inherits } from 'util';

export default class {
  constructor(api) {
    this.hapChar = api.hap.Characteristic;
    this.uuids = {
      maxSpeed: 'E963F001-079E-48FF-8F27-9C2605A29F52',
      predefinedArea: 'E963F002-079E-48FF-8F27-9C2605A29F52',
      trueDetect: 'E963F003-079E-48FF-8F27-9C2605A29F52',
    };
    const self = this;
    this.MaxSpeed = function MaxSpeed() {
      self.hapChar.call(this, 'Max Speed', self.uuids.maxSpeed);
      this.setProps({
        format: self.hapChar.Formats.BOOL,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.WRITE, self.hapChar.Perms.NOTIFY],
      });
      this.value = this.getDefaultValue();
    };

    this.PredefinedArea = function PredefinedArea() {
      self.hapChar.call(this, 'Predefined Area', self.uuids.predefinedArea);
      this.setProps({
        format: self.hapChar.Formats.UINT8,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.WRITE, self.hapChar.Perms.NOTIFY],
        minValue: 0,
        maxValue: 15,
        minStep: 1,
        validValues: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      });
      this.value = this.getDefaultValue();
    };

    this.TrueDetect = function TrueDetect() {
      self.hapChar.call(this, 'TrueDetect', self.uuids.trueDetect);
      this.setProps({
        format: self.hapChar.Formats.BOOL,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.WRITE, self.hapChar.Perms.NOTIFY],
      });
      this.value = this.getDefaultValue();
    };

    inherits(this.MaxSpeed, this.hapChar);
    inherits(this.PredefinedArea, this.hapChar);
    inherits(this.TrueDetect, this.hapChar);
    this.MaxSpeed.UUID = this.uuids.maxSpeed;
    this.PredefinedArea.UUID = this.uuids.predefinedArea;
    this.TrueDetect.UUID = this.uuids.trueDetect;
  }
}
