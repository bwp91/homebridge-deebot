const request = require('request');
var locks = require('locks');
var mutex = locks.createMutex();

module.exports = {
  DeebotEcovacsAPI: DeebotEcovacsAPI,
};

function DeebotEcovacsAPI(log, platform) {
  this.log = log;
  this.platform = platform;
  this.login = platform.login;
  this.password = platform.password;
  this.countryCode = platform.countryCode;

}

DeebotEcovacsAPI.prototype = {

  authenticate: function(callback) {
      callback();
  },

  getDeebots: function(callback) {
    let deebots = [];
    callback(deebots);
  },

  sendCommand: function(
    homebridgeAccessory,
    command,
    characteristic,
    callback
  ) {
    callback();
  },
};

