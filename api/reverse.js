'use strict';

const { toVercel } = require('./_lib/serve');
const { reverse } = require('./_lib/handlers');

module.exports = toVercel(reverse);
