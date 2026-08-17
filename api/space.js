'use strict';

const { toVercel } = require('./_lib/serve');
const { space } = require('./_lib/handlers');

module.exports = toVercel(space);
