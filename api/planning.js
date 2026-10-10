'use strict';
const { toVercelDocument } = require('./_lib/serve');
const { planningPage } = require('./_lib/pages');
module.exports = toVercelDocument(planningPage);
