#!/usr/bin/env node
const LIMIT_MS = 200;
const WAIT_MS = LIMIT_MS * 3;
const order = process.argv[2];

function sendThatThrows() {
  throw new Error('send threw before the message left');
}

function timer200() {
  let timer;
  const timedOut = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`timed out after ${LIMIT_MS} ms`)), LIMIT_MS);
  });
  return { timedOut, clear: () => clearTimeout(timer) };
}

async function baseOrder() {
  const { timedOut, clear } = timer200();
  return Promise.race([sendThatThrows(), timedOut]).finally(clear);
}

async function changeOrder() {
  const answer = sendThatThrows();
  const { timedOut, clear } = timer200();
  return Promise.race([answer, timedOut]).finally(clear);
}

const ORDERS = { base: baseOrder, change: changeOrder };
if (!ORDERS[order]) {
  process.stdout.write('usage: node timer-pattern.mjs base|change\n');
  process.exit(2);
}
process.on('uncaughtExceptionMonitor', (error, origin) => process.stdout.write(`process ending, origin ${origin}: ${error.message}\n`));
process.on('exit', (code) => process.stdout.write(`process exit code ${code}\n`));
process.stdout.write(`order ${order}: timer of ${LIMIT_MS} ms, then waiting ${WAIT_MS} ms after the call\n`);
try {
  await ORDERS[order]();
  process.stdout.write('call answered\n');
} catch (error) {
  process.stdout.write(`caller caught: ${error.message}\n`);
}
await new Promise((done) => setTimeout(done, WAIT_MS));
process.stdout.write(`still running ${WAIT_MS} ms after the call, ending normally\n`);
