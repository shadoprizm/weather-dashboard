'use strict';
const { toVercel } = require('./_lib/serve');
const { plan } = require('./_lib/planner');
module.exports = toVercel(plan);
