#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const outreach = require('../api/_lib/widget-outreach');

const filename = process.argv.find((argument) => !argument.startsWith('--') && argument.endsWith('.json'))
  || 'outreach/widget-targets.local.json';
const ledger = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
const report = { summary: outreach.summarizeLedger(ledger) };

if (process.argv.includes('--verify')) {
  report.installChecks = await outreach.verifyInstallPages(ledger);
}

console.log(JSON.stringify(report, null, 2));
