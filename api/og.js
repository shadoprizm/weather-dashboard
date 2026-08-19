'use strict';

const { toVercelDocument } = require('./_lib/serve');
const { ogCard } = require('./_lib/og');

module.exports = toVercelDocument(ogCard);
