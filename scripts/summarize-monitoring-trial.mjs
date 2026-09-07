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
const replay = process.argv.includes('--replay');
const hoursIndex = process.argv.indexOf('--hours');
const hours = hoursIndex >= 0 ? process.argv[hoursIndex + 1] : 36;
const runs = trial.listRuns(directory);
const result = replay ? trial.replayRuns(runs, { hours }) : null;

if (replay && !result.runs.length) {
  const reason = runs.length
    ? 'The available runs predate schema v2 and contain no replayable forecast evidence.'
    : `No monitoring runs were found in ${directory}.`;
  throw new Error(`${reason} Let the v2 trial collect new samples, or pass --directory for a v2 artifact.`);
}

console.log(JSON.stringify(
  replay ? result.summary : trial.summarizeRuns(runs),
  null,
  2
));
