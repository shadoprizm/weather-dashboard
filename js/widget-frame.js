/**
 * Height reporting for an embedded widget.
 *
 * Loaded only when the widget is opened with `?embed=1`, which `embed.js`
 * does. A plain `<iframe>` embed never asks for this file and therefore runs
 * no script at all — the auto-sizing convenience is opt-in, not the price of
 * using the widget.
 */

function report() {
  const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
  // The host page only ever learns a number, and only about its own iframe.
  parent.postMessage({ type: 'weatherview:height', height }, '*');
}

window.addEventListener('load', report);
window.addEventListener('resize', report);
report();
