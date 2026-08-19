'use strict';

/**
 * Bridge from the CommonJS server to the ES-module views.
 *
 * The views are already pure functions from view model to HTML string — that
 * is what lets `npm test` render the whole app in Node — so the server can
 * call exactly the same code the browser calls. Dynamic `import()` is how CJS
 * reaches ESM; the modules are loaded once per process and cached.
 *
 * Because the import specifier is computed, the bundler cannot trace it, so
 * `vercel.json` includes `js/**` in the function bundle explicitly.
 */

const path = require('path');
const { pathToFileURL } = require('url');

const JS_DIR = path.join(__dirname, '..', '..', '..', 'js');

let pending = null;

function load() {
  if (pending) return pending;

  const from = (file) => import(pathToFileURL(path.join(JS_DIR, file)).href);

  pending = Promise.all([
    from('viewmodel.js'),
    from('views/forecast.js'),
    from('views/panels.js'),
    from('views/tables.js'),
    from('insights.js'),
    from('format.js'),
    from('wmo.js'),
    from('state.js'),
    from('icons.js'),
  ]).then(([viewmodel, forecast, panels, tables, insights, format, wmo, state, icons]) => ({
    viewmodel, forecast, panels, tables, insights, format, wmo, state, icons,
  }));

  return pending;
}

module.exports = { load };
