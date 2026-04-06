#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { c, log, error, heading } = require('../lib/utils');

const VERSION = require('../package.json').version;

const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const sub = args[1];
const rest = args.slice(2);

async function main() {
  try {
    switch (cmd) {
      case 'init': {
        const init = require('../lib/init');
        await init.run(sub);
        break;
      }

      case 'start': {
        const cmds = require('../lib/commands');
        await cmds.start();
        break;
      }

      case 'stop': {
        const cmds = require('../lib/commands');
        await cmds.stop();
        break;
      }

      case 'status': {
        const cmds = require('../lib/commands');
        await cmds.status();
        break;
      }

      case 'agent': {
        const cmds = require('../lib/commands');
        if (sub === 'list' || !sub) {
          await cmds.agentList();
        } else if (sub === 'create') {
          await cmds.agentCreate(rest[0]);
        } else {
          error(`Unknown agent command: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'company': {
        const cmds = require('../lib/commands');
        if (sub === 'list' || !sub) {
          await cmds.companyList();
        } else if (sub === 'create') {
          await cmds.companyCreate(rest[0]);
        } else {
          error(`Unknown company command: ${sub}`);
          process.exit(1);
        }
        break;
      }

      case 'migrate': {
        const cmds = require('../lib/commands');
        if (sub === 'paperclip') {
          await cmds.migratePaperclip();
        } else {
          error(`Unknown migration target: ${sub || '(none)'}`);
          log(`  Available: paperclip`);
          process.exit(1);
        }
        break;
      }

      case 'skill': {
        const cmds = require('../lib/commands');
        if (sub === 'install') {
          await cmds.skillInstall(rest[0]);
        } else {
          error(`Usage: blun skill install <name>`);
          process.exit(1);
        }
        break;
      }

      case 'tool': {
        const cmds = require('../lib/commands');
        if (sub === 'install') {
          await cmds.toolInstall(rest[0]);
        } else {
          error(`Usage: blun tool install <repo>`);
          process.exit(1);
        }
        break;
      }

      case 'version':
      case '--version':
      case '-v': {
        log(`blun ${VERSION}`);
        break;
      }

      case 'help':
      case '--help':
      case '-h': {
        showHelp();
        break;
      }

      default: {
        error(`Unknown command: ${cmd}`);
        log();
        showHelp();
        process.exit(1);
      }
    }
  } catch (err) {
    error(err.message);
    if (process.env.DEBUG) console.error(err);
    process.exit(1);
  }
}

function showHelp() {
  log();
  log(`  ${c.bold('BLUN')} ${c.dim(VERSION)} -- AI Organisator`);
  log();
  log(`  ${c.yellow('Usage:')}  blun <command> [options]`);
  log();
  log(`  ${c.yellow('Commands:')}`);
  log();
  log(`    ${c.bold('init')} [name]            Create a new BLUN project`);
  log(`    ${c.bold('start')}                  Start the BLUN server`);
  log(`    ${c.bold('stop')}                   Stop the BLUN server`);
  log(`    ${c.bold('status')}                 Show server health and stats`);
  log();
  log(`    ${c.bold('agent')} list             List all agents`);
  log(`    ${c.bold('agent')} create <name>    Create a new agent`);
  log();
  log(`    ${c.bold('company')} list           List all companies`);
  log(`    ${c.bold('company')} create <name>  Create a new company`);
  log();
  log(`    ${c.bold('migrate')} paperclip      Import from Paperclip`);
  log();
  log(`    ${c.bold('skill')} install <name>   Install a skill`);
  log(`    ${c.bold('tool')} install <repo>    Install a tool from git`);
  log();
  log(`    ${c.bold('version')}                Show version`);
  log(`    ${c.bold('help')}                   Show this help`);
  log();
}

main();
