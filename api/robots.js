'use strict';

const { toVercelDocument } = require('./_lib/serve');
const { robots } = require('./_lib/pages');

module.exports = toVercelDocument(robots);
