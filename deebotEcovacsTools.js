module.exports = {
  checkTimer: function(timer) {
    if (timer && timer > 0 && (timer < 30 || timer > 600)) return 300;
    else return timer;
  },

  DeebotEcovacsAccessory: function(services) {
    this.services = services;
  },
};
