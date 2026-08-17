'use strict';

const { toVercel } = require('./_lib/serve');
const { radar } = require('./_lib/handlers');

module.exports = toVercel(radar);
