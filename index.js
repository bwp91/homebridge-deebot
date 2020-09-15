/* jshint esversion: 9, -W030, node: true */
"use strict";
module.exports = function (homebridge) {
  let Deebot = require("./lib/deebot.js")(homebridge);
  homebridge.registerPlatform("homebridge-deebot", "Deebot", Deebot, true);
};
