import { inherits } from 'util';

export default class {
  constructor(api) {
    this.hapChar = api.hap.Characteristic;
    this.uuids = {
      maxSpeed: 'E963F001-079E-48FF-8F27-9C2605A29F52',
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

    this.TrueDetect = function TrueDetect() {
      self.hapChar.call(this, 'TrueDetect', self.uuids.trueDetect);
      this.setProps({
        format: self.hapChar.Formats.BOOL,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.WRITE, self.hapChar.Perms.NOTIFY],
      });
      this.value = this.getDefaultValue();
    };

    inherits(this.MaxSpeed, this.hapChar);
    inherits(this.TrueDetect, this.hapChar);
    this.MaxSpeed.UUID = this.uuids.maxSpeed;
    this.TrueDetect.UUID = this.uuids.trueDetect;
  }
}
