'use strict';

const { toVercelDocument } = require('./_lib/serve');
const { sitemap } = require('./_lib/pages');

module.exports = toVercelDocument(sitemap);
