#!/usr/bin/env node

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const stories = require('../api/_lib/stories');

const report = stories.auditStories();
console.log(JSON.stringify(report, null, 2));

if (report.invalid.length) {
  console.error(`${report.invalid.length} invalid story file(s) block release.`);
  process.exitCode = 1;
}
