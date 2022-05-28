import platformLang from './lang-en.js';

const logDefault = (k, def) => {
  this.log.warn('%s [%s] %s %s.', platformLang.cfgItem, k, platformLang.cfgDef, def);
};

const logDuplicate = (k) => {
  this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgDup);
};

const logIgnore = (k) => {
  this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgIgn);
};

const logIgnoreItem = (k) => {
  this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgIgnItem);
};

const logIncrease = (k, min) => {
  this.log.warn('%s [%s] %s %s.', platformLang.cfgItem, k, platformLang.cfgLow, min);
};

const logQuotes = (k) => {
  this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgQts);
};

const logRemove = (k) => {
  this.log.warn('%s [%s] %s.', platformLang.cfgItem, k, platformLang.cfgRmv);
};

const parseError = (err, hideStack = []) => {
  let toReturn = err.message;
  if (err?.stack.length > 0 && !hideStack.includes(err.message)) {
    const stack = err.stack.split('\n');
    if (stack[1]) {
      toReturn += stack[1].replace('   ', '');
    }
  }
  return toReturn;
};

const sleep = (seconds) => new Promise((resolve) => {
  setTimeout(resolve, seconds * 1000);
});

export {
  logDefault,
  logDuplicate,
  logIgnore,
  logIgnoreItem,
  logIncrease,
  logQuotes,
  logRemove,
  parseError,
  sleep,
};
