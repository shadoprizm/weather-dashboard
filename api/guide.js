'use strict';

const { toVercelDocument } = require('./_lib/serve');
const { guidePage } = require('./_lib/pages');

module.exports = toVercelDocument(guidePage);
