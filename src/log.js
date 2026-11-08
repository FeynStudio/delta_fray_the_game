// Project logger: silent unless the page URL has ?debug=1.
const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

const emit = (method) => (...args) => {
  if (enabled) console[method]('[game]', ...args);
};

export const log = { info: emit('info'), warn: emit('warn'), error: emit('error') };
export default log;
