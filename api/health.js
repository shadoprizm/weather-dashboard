'use strict';

const { toVercel } = require('./_lib/serve');
const { health } = require('./_lib/handlers');

module.exports = toVercel(health);
