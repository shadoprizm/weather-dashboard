'use strict';

const { toVercelDocument } = require('./_lib/serve');
const { cityPage } = require('./_lib/pages');

module.exports = toVercelDocument(cityPage);
