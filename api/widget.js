'use strict';

const { toVercelDocument } = require('./_lib/serve');
const { renderWidget } = require('./_lib/render/widget');

module.exports = toVercelDocument(renderWidget);
