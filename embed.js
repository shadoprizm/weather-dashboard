/**
 * The one-line WeatherView embed.
 *
 * <script src="https://weatherview.cloud/embed.js" data-city="toronto" async></script>
 *
 * Replaces itself with a sandboxed iframe pointing at /widget, and resizes it
 * to whatever the widget actually needs. Everything it can do is bounded by
 * that iframe: it reads its own attributes, writes one element, and listens
 * for one message from its own frame. It never touches cookies, never reads
 * the host page, and never phones home about the host's visitors.
 *
 * Prefer a plain <iframe> if you would rather run no script at all — see
 * https://weatherview.cloud/widgets
 */
(function () {
  'use strict';

  var ORIGIN = 'https://weatherview.cloud';

  // `async` and `defer` both leave currentScript null, so fall back to the
  // last unclaimed embed tag on the page.
  function findScript() {
    if (document.currentScript) return document.currentScript;
    var candidates = document.querySelectorAll('script[src*="embed.js"]:not([data-wv-done])');
    return candidates.length ? candidates[candidates.length - 1] : null;
  }

  var script = findScript();
  if (!script) return;
  script.setAttribute('data-wv-done', '1');

  var data = script.dataset || {};
  var params = [];

  function add(key, value) {
    if (value !== undefined && value !== null && value !== '') {
      params.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
  }

  add('city', data.city);
  add('lat', data.lat);
  add('lon', data.lon);
  add('name', data.name);
  add('units', data.units);
  add('theme', data.theme);
  add('days', data.days);
  add('accent', data.accent);
  add('embed', '1');

  var iframe = document.createElement('iframe');
  iframe.src = ORIGIN + '/widget?' + params.join('&');
  iframe.title = 'Weather' + (data.city ? ' for ' + data.city : '');
  iframe.loading = 'lazy';
  iframe.scrolling = 'no';
  iframe.setAttribute('frameborder', '0');
  iframe.style.cssText = [
    'width:100%',
    'max-width:' + (data.width || '360px'),
    'height:' + (data.height || (data.days === '0' ? '170px' : '250px')),
    'border:0',
    'border-radius:' + (data.radius || '14px'),
    'overflow:hidden',
    'display:block',
    'color-scheme:normal',
  ].join(';');

  script.parentNode.insertBefore(iframe, script);

  // Size to content. Bounded so a bad message cannot make the frame swallow
  // the host page.
  window.addEventListener('message', function (event) {
    if (event.source !== iframe.contentWindow) return;
    var message = event.data;
    if (!message || message.type !== 'weatherview:height') return;
    var height = Number(message.height);
    if (height > 80 && height < 900) iframe.style.height = Math.ceil(height) + 'px';
  });
}());
