/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = {
  hasProperty: (obj, prop) => {
    return Object.prototype.hasOwnProperty.call(obj, prop)
  },

  sleep: ms => {
    return new Promise(resolve => setTimeout(resolve, ms))
  },

  parseError: input => {
    let toReturn = input.message
    if (input.stack && input.stack.length > 0) {
      const stack = input.stack.split('\n')
      if (stack[1]) {
        toReturn += stack[1].replace('   ', '')
      }
    }
    return toReturn
  }
}
