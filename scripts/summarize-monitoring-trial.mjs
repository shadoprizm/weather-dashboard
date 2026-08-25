#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const trial = require('../api/_lib/monitoring/trial-store');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directoryIndex = process.argv.indexOf('--directory');
const directory = path.resolve(directoryIndex >= 0
  ? process.argv[directoryIndex + 1]
  : path.join(ROOT, 'monitoring-trial'));

console.log(JSON.stringify(trial.summarizeRuns(trial.listRuns(directory)), null, 2));
