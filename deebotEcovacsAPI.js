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
    let deebot = {};
    deebot.name = 'TEST DEEBOT';
    deebot.model = 'VADOR';
    deebot.id = '123';
    deebot.status = {};
    deebot.status.batteryPercent = '100';
    deebot.status.deebotStatus = {};
    deebot.status.deebotStatus.activity = 'CLEANING';
    deebot.status.connected = true;

    deebots.push(deebot);

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
