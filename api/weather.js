'use strict';

const { toVercel } = require('./_lib/serve');
const { forecast } = require('./_lib/handlers');

module.exports = toVercel(forecast);
