'use strict';

const { toVercel } = require('./_lib/serve');
const { alerts } = require('./_lib/handlers');

module.exports = toVercel(alerts);
