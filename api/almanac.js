'use strict';

const { toVercel } = require('./_lib/serve');
const { almanac } = require('./_lib/handlers');

module.exports = toVercel(almanac);
