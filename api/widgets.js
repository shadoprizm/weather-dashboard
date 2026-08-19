'use strict';

const { toVercelDocument } = require('./_lib/serve');
const { widgetsPage } = require('./_lib/pages');

module.exports = toVercelDocument(widgetsPage);
