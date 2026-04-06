'use strict';

const isColorSupported = process.stdout.isTTY && !process.env.NO_COLOR;

const fmt = (open, close) => {
  if (!isColorSupported) return (s) => s;
  return (s) => `\x1b[${open}m${s}\x1b[${close}m`;
};

const c = {
  bold:    fmt(1, 22),
  dim:     fmt(2, 22),
  red:     fmt(31, 39),
  green:   fmt(32, 39),
  yellow:  fmt(33, 39),
  blue:    fmt(34, 39),
  cyan:    fmt(36, 39),
  gray:    fmt(90, 39),
};

function log(msg = '') {
  console.log(msg);
}

function info(msg) {
  console.log(`  ${c.cyan('i')} ${msg}`);
}

function success(msg) {
  console.log(`  ${c.green('+')} ${msg}`);
}

function warn(msg) {
  console.log(`  ${c.yellow('!')} ${msg}`);
}

function error(msg) {
  console.error(`  ${c.red('x')} ${msg}`);
}

function heading(msg) {
  console.log();
  console.log(`  ${c.bold(msg)}`);
  console.log();
}

function table(rows, indent = 4) {
  if (!rows.length) return;
  const pad = ' '.repeat(indent);
  const maxKey = Math.max(...rows.map(([k]) => k.length));
  for (const [key, val] of rows) {
    console.log(`${pad}${c.dim(key.padEnd(maxKey))}  ${val}`);
  }
}

const spinnerFrames = ['|', '/', '-', '\\'];

function spinner(msg) {
  if (!isColorSupported) {
    process.stdout.write(`  ${msg}...`);
    return { stop(final) { console.log(final ? ` ${final}` : ''); } };
  }
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r  ${c.yellow(spinnerFrames[i++ % 4])} ${msg}`);
  }, 80);
  return {
    stop(final) {
      clearInterval(id);
      process.stdout.write(`\r${' '.repeat(msg.length + 6)}\r`);
      if (final) console.log(`  ${c.green('+')} ${final}`);
    },
  };
}

module.exports = { c, log, info, success, warn, error, heading, table, spinner };
