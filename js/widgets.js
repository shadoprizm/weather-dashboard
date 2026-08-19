/**
 * The widget builder on /widgets.
 *
 * Keeps the preview iframe, the plain-iframe snippet and the script snippet in
 * step with the form. Nothing here is required to *use* the widget — it exists
 * so a site owner never has to read documentation to get one.
 */

const DEFAULT_ORIGIN = 'https://www.weatherview.cloud';

function readForm(form) {
  const data = new FormData(form);
  const accent = String(data.get('accent') || '').replace('#', '');
  return {
    city: String(data.get('city') || 'toronto'),
    days: String(data.get('days') || '3'),
    theme: String(data.get('theme') || 'auto'),
    units: String(data.get('units') || ''),
    accent: accent && accent.toLowerCase() !== '3b82f6' ? accent : '',
    width: String(data.get('width') || '360px').trim() || '360px',
  };
}

function widgetQuery(values, { embed = false } = {}) {
  const params = new URLSearchParams();
  params.set('city', values.city);
  params.set('days', values.days);
  params.set('theme', values.theme);
  if (values.units) params.set('units', values.units);
  if (values.accent) params.set('accent', values.accent);
  if (embed) params.set('embed', '1');
  return params.toString();
}

/**
 * A fixed height, because a plain iframe cannot measure itself. Generous
 * enough that a weather warning appearing in the widget does not clip it.
 */
function iframeHeight(days) {
  return days === '0' ? 180 : 260;
}

function iframeSnippet(origin, values) {
  return `<iframe
  src="${origin}/widget?${widgetQuery(values)}"
  title="Weather for ${values.city}"
  width="${values.width}" height="${iframeHeight(values.days)}"
  style="border:0;border-radius:14px;max-width:100%"
  loading="lazy" scrolling="no"></iframe>`;
}

function scriptSnippet(origin, values) {
  const attributes = [
    `src="${origin}/embed.js"`,
    `data-city="${values.city}"`,
    `data-days="${values.days}"`,
    `data-theme="${values.theme}"`,
    values.units ? `data-units="${values.units}"` : '',
    values.accent ? `data-accent="${values.accent}"` : '',
    `data-width="${values.width}"`,
    'async',
  ].filter(Boolean);
  return `<script ${attributes.join(' ')}></scr` + `ipt>`;
}

export function setupWidgetBuilder({ origin = DEFAULT_ORIGIN, toast = () => {} } = {}) {
  const form = document.getElementById('widget-builder');
  const preview = document.getElementById('widget-preview');
  if (!form || !preview) return;

  const snippets = {
    'snippet-iframe': iframeSnippet,
    'snippet-script': scriptSnippet,
  };

  function update() {
    const values = readForm(form);
    const next = `/widget?${widgetQuery(values, { embed: true })}`;
    if (preview.getAttribute('src') !== next) preview.setAttribute('src', next);
    preview.style.width = values.width;

    for (const [id, build] of Object.entries(snippets)) {
      const node = document.querySelector(`#${id} code`);
      if (node) node.textContent = build(origin, values);
    }
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (event) => event.preventDefault());

  document.querySelectorAll('.snippet-copy').forEach((button) => {
    button.addEventListener('click', async () => {
      const node = document.querySelector(`#${button.dataset.copy} code`);
      if (!node) return;
      try {
        await navigator.clipboard.writeText(node.textContent);
        toast('Snippet copied');
      } catch (error) {
        // Clipboard access can be refused; selecting it is the next best thing.
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        toast('Press ⌘C / Ctrl+C to copy');
      }
    });
  });

  // The preview reports its height through the same channel embed.js uses.
  window.addEventListener('message', (event) => {
    if (event.source !== preview.contentWindow) return;
    const message = event.data;
    if (!message || message.type !== 'weatherview:height') return;
    const height = Number(message.height);
    if (height > 80 && height < 900) preview.style.height = `${Math.ceil(height)}px`;
  });

  update();
}
