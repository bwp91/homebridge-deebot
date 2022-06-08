const parseError = (err, hideStack = []) => {
  let toReturn = err.message;
  if (err?.stack?.length > 0 && !hideStack.includes(err.message)) {
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

export { parseError, sleep };
