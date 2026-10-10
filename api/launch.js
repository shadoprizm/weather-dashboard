'use strict';
const { toVercelDocument } = require('./_lib/serve');
const { launchPage } = require('./_lib/pages');
module.exports = toVercelDocument(launchPage);
