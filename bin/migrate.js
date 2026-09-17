#!/usr/bin/env node
require('dotenv').config();
const { Migrator } = require('../src/migrations/Migrator');

// Usage :
//   node bin/migrate.js up
//   node bin/migrate.js up --dry-run
//   node bin/migrate.js down 2
//   node bin/migrate.js status
//   node bin/migrate.js create add_column_to_users

const [, , command, ...rest] = process.argv;
const dryRun = rest.includes('--dry-run');
const arg = rest.find(a => !a.startsWith('--'));

(async () => {
  try {
    switch (command) {
      case 'up':
        await Migrator.up({ dryRun });
        break;

      case 'down':
        await Migrator.down({ steps: arg ? parseInt(arg, 10) : 1, dryRun });
        break;

      case 'status': {
        const status = await Migrator.status();
        console.table(status);
        break;
      }

      case 'create':
        if (!arg) throw new Error('Usage : node bin/migrate.js create <nom>');
        Migrator.create(arg);
        break;

      default:
        console.log('Usage : node bin/migrate.js <up|down|status|create> [arg] [--dry-run]');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();