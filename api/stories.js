'use strict';

const { toVercelDocument } = require('./_lib/serve');
const { weatherStoryPage } = require('./_lib/pages');

module.exports = toVercelDocument(weatherStoryPage);
