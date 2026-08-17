/** Small DOM helpers. */

/**
 * Escape text for interpolation into an HTML template.
 *
 * Place names come from a third-party geocoder and from the URL, so every
 * untrusted string has to pass through here before it reaches innerHTML.
 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Tagged template that escapes every interpolated value. */
export function html(strings, ...values) {
  return strings.reduce(
    (out, chunk, i) => out + chunk + (i < values.length ? esc(values[i]) : ''),
    ''
  );
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function setHTML(target, markup) {
  const node = typeof target === 'string' ? $(target) : target;
  if (node) node.innerHTML = markup;
  return node;
}

/** Event delegation: one listener per container instead of one per card. */
export function delegate(root, eventName, selector, handler) {
  root.addEventListener(eventName, (event) => {
    const match = event.target.closest(selector);
    if (match && root.contains(match)) handler(event, match);
  });
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Map a value from one range to another, clamped to the output range. */
export function scale(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return clamp(
    outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin),
    Math.min(outMin, outMax),
    Math.max(outMin, outMax)
  );
}
