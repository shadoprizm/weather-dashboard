'use strict';

const { toVercel } = require('./_lib/serve');
const { geocode } = require('./_lib/handlers');

module.exports = toVercel(geocode);
