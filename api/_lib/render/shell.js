'use strict';

/**
 * The server-rendered document, built from the app shell itself.
 *
 * `index.html` stays the single definition of the page furniture — header,
 * search, tab bar, panel mount points, footer. Rather than keeping a second
 * copy of that markup here (which would drift the first time someone edits a
 * button), this module reads the shell off disk and fills it in:
 *
 *   - everything between the `<!--wv:head-->` markers is replaced with the
 *     page's own title, description, canonical and social tags;
 *   - each panel mount point is filled with server-rendered HTML;
 *   - the tab bar is opened on the section the URL asked for;
 *   - a JSON bootstrap block tells the client which place it is already
 *     looking at, so hydration does not flash a different location.
 *
 * The bootstrap is `type="application/json"`, not executable script, so the
 * strict `script-src 'self'` policy stays exactly as it is.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SHELL_PATH = path.join(ROOT, 'index.html');

let cachedShell = null;

function shell() {
  // Read once per process. The file ships with the deployment and cannot
  // change under a running function, so re-reading it would be pure syscall.
  if (cachedShell !== null) return cachedShell;

  try {
    cachedShell = fs.readFileSync(SHELL_PATH, 'utf8');
  } catch (error) {
    // The specifier is computed, so no bundler can trace it. If this fires in
    // production it means the deployment config stopped shipping the shell.
    throw new Error(
      `Could not read the page shell at ${SHELL_PATH}. ` +
      'Serverless deployments must include index.html in the function bundle ' +
      '(see "functions.includeFiles" in vercel.json).'
    );
  }

  return cachedShell;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Replace the inner HTML of `<tag id="…">…</tag>`, leaving its attributes. */
function fillMount(html, id, markup) {
  const pattern = new RegExp(
    `(<(section|div)\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</\\2>)`
  );
  if (!pattern.test(html)) throw new Error(`Shell has no mount point #${id}`);
  return html.replace(pattern, (match, open, tag, _inner, close) => open + markup + close);
}

/** Open the tab bar on `view`, closing the rest. */
function selectView(html, view) {
  return html
    .replace(/(<button class="tab" role="tab" id="tab-)(\w+)("[^>]*?)aria-selected="(?:true|false)"([^>]*?)tabindex="(?:0|-1)"/g,
      (match, head, name, mid, tail) => {
        const active = name === view;
        return `${head}${name}${mid}aria-selected="${active}"${tail}tabindex="${active ? 0 : -1}"`;
      })
    .replace(/(<div class="view" id="view-)(\w+)("[^>]*?)(\s+hidden)?(>)/g,
      (match, head, name, mid, hidden, close) =>
        `${head}${name}${mid}${name === view ? '' : ' hidden'}${close}`);
}

/**
 * Build a complete HTML document.
 *
 * `mounts` maps a mount-point id to its markup; `head` is the raw block of
 * document-identity tags; `bootstrap` is the JSON handed to the client.
 */
function renderDocument({
  head, mounts = {}, view = 'today', bootstrap = null, sky = null, theme = null,
  tabs = true,
}) {
  let html = shell();

  html = html.replace(
    /<!--wv:head-->[\s\S]*?<!--\/wv:head-->/,
    `<!--wv:head-->\n${head}\n  <!--/wv:head-->`
  );

  for (const [id, markup] of Object.entries(mounts)) {
    if (markup === undefined || markup === null) continue;
    html = fillMount(html, id, markup);
  }

  html = selectView(html, view);

  // Pages that are not a forecast -- the directory, the widget builder, a 404
  // -- keep the header and the footer but have nothing to put behind a tab
  // bar, so it is removed rather than left as five dead buttons.
  if (!tabs) {
    html = html
      .replace('<nav class="tabs" role="tablist"', '<nav class="tabs" role="tablist" hidden')
      .replace('<div class="views">', '<div class="views" hidden>');
  }

  if (sky) html = html.replace('data-sky="clear-day"', `data-sky="${escapeHtml(sky)}"`);
  if (theme) html = html.replace('<html lang="en">', `<html lang="en" data-theme="${escapeHtml(theme)}">`);

  if (bootstrap) {
    // JSON.stringify escapes `<` poorly for inline script contexts; closing the
    // block early is the one thing that would break out of it.
    const json = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
    html = html.replace(
      '<!--wv:bootstrap-->',
      `<script type="application/json" id="wv-bootstrap">${json}</script>`
    );
  }

  return html;
}

module.exports = { renderDocument, escapeHtml, fillMount, selectView, shell };
