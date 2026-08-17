/**
 * Hand-built SVG weather icons.
 *
 * Emoji were the old approach: they render differently on every platform, do
 * not inherit theme colour, and look wrong at large sizes. These are inline
 * SVG on a 24x24 grid, coloured entirely from CSS custom properties so they
 * follow the sky theme.
 */

let uid = 0;

const SUN_RAYS = [
  [12, 1.2, 12, 3.4], [12, 20.6, 12, 22.8],
  [1.2, 12, 3.4, 12], [20.6, 12, 22.8, 12],
  [4.4, 4.4, 6, 6], [18, 18, 19.6, 19.6],
  [19.6, 4.4, 18, 6], [6, 18, 4.4, 19.6],
];

function sun(cx = 12, cy = 12, r = 4.6, rays = true) {
  const lines = rays
    ? SUN_RAYS.map(([x1, y1, x2, y2]) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('')
    : '';
  return `<g class="wi-sun"><circle cx="${cx}" cy="${cy}" r="${r}"/>${lines}</g>`;
}

function moon(cx = 12, cy = 12, r = 7) {
  const id = `wi-moon-${(uid += 1)}`;
  return `<g class="wi-moon">
    <mask id="${id}">
      <rect width="24" height="24" fill="#fff"/>
      <circle cx="${cx + 5}" cy="${cy - 5}" r="${r}" fill="#000"/>
    </mask>
    <circle cx="${cx}" cy="${cy}" r="${r}" mask="url(#${id})"/>
  </g>`;
}

/** Puffy cloud built from primitives so it renders identically everywhere. */
function cloud(dx = 0, dy = 0, scale = 1, className = 'wi-cloud') {
  return `<g class="${className}" transform="translate(${dx} ${dy}) scale(${scale})">
    <circle cx="9" cy="12.2" r="3.7"/>
    <circle cx="14.6" cy="11" r="4.5"/>
    <rect x="5.3" y="13" width="13.4" height="5.2" rx="2.6"/>
  </g>`;
}

function drops(points, className = 'wi-rain') {
  return `<g class="${className}">${points
    .map(([x, y, len]) => `<line x1="${x}" y1="${y}" x2="${x - 0.9}" y2="${y + len}"/>`)
    .join('')}</g>`;
}

function flakes(points, className = 'wi-snow') {
  return `<g class="${className}">${points
    .map(([x, y, r]) => `
      <line x1="${x}" y1="${y - r}" x2="${x}" y2="${y + r}"/>
      <line x1="${x - r * 0.87}" y1="${y - r * 0.5}" x2="${x + r * 0.87}" y2="${y + r * 0.5}"/>
      <line x1="${x - r * 0.87}" y1="${y + r * 0.5}" x2="${x + r * 0.87}" y2="${y - r * 0.5}"/>`)
    .join('')}</g>`;
}

function bolt() {
  return `<path class="wi-bolt" d="M13.4 15.2h3.1l-5.6 7 1.3-4.6H9.1l4.9-6.4z"/>`;
}

const BUILDERS = {
  'clear-day': () => sun(),
  'clear-night': () => moon(),

  'partly-day': () => `${sun(16.5, 7.5, 3.6, true)}${cloud(-1.5, 2.5, 0.92)}`,
  'partly-night': () => `${moon(16.5, 7.5, 4.6)}${cloud(-1.5, 2.5, 0.92)}`,

  cloudy: () => cloud(0, 1),
  overcast: () => `${cloud(3.5, -1.5, 0.72, 'wi-cloud wi-cloud-back')}${cloud(-1, 2, 0.92)}`,

  fog: () => `${cloud(0, -2, 0.9)}
    <g class="wi-fog">
      <line x1="4" y1="17.5" x2="20" y2="17.5"/>
      <line x1="6" y1="20" x2="18" y2="20"/>
      <line x1="8.5" y1="22.4" x2="15.5" y2="22.4"/>
    </g>`,

  drizzle: () => `${cloud(0, -1.6, 0.92)}${drops([[9.5, 17.6, 2], [14.5, 17.6, 2]])}`,
  rain: () => `${cloud(0, -1.6, 0.92)}${drops([[8.5, 17.4, 3.2], [12, 18.4, 3.2], [15.5, 17.4, 3.2]])}`,
  'heavy-rain': () => `${cloud(0, -2, 0.92)}${drops(
    [[7.5, 16.8, 4.4], [10.5, 18, 4.4], [13.5, 16.8, 4.4], [16.5, 18, 4.4]],
    'wi-rain wi-heavy'
  )}`,

  sleet: () => `${cloud(0, -1.6, 0.92)}${drops([[9, 17.6, 3]])}${flakes([[15, 19.4, 1.9]])}`,
  snow: () => `${cloud(0, -1.6, 0.92)}${flakes([[9, 19.2, 2], [15, 19.2, 2]])}`,
  'heavy-snow': () => `${cloud(0, -2, 0.92)}${flakes(
    [[7.6, 18.6, 1.9], [12, 20.6, 1.9], [16.4, 18.6, 1.9]],
    'wi-snow wi-heavy'
  )}`,

  thunder: () => `${cloud(0, -2, 0.92)}${bolt()}`,
  'thunder-hail': () => `${cloud(0, -2.4, 0.9)}${bolt()}
    <g class="wi-hail"><circle cx="7.6" cy="19" r="1.15"/><circle cx="18" cy="20.2" r="1.15"/></g>`,

  unknown: () => `${cloud(0, -1, 0.92)}
    <text class="wi-unknown" x="12" y="23" text-anchor="middle">?</text>`,
};

/**
 * Render a weather icon.
 * @param {string} name key from `describe().icon`
 * @param {{size?: number, className?: string, title?: string}} options
 */
export function weatherIcon(name, { size = 48, className = '', title = '' } = {}) {
  const build = BUILDERS[name] || BUILDERS.unknown;
  const label = title
    ? `<title>${title.replace(/[<>&]/g, '')}</title>`
    : '';
  return `<svg class="wi ${className}" viewBox="0 0 24 24" width="${size}" height="${size}"
    role="${title ? 'img' : 'presentation'}" ${title ? '' : 'aria-hidden="true"'}
    focusable="false">${label}${build()}</svg>`;
}

/** Wind-direction arrow. `degrees` is the direction the wind blows *from*. */
export function windArrow(degrees, { size = 16, className = '' } = {}) {
  // The arrow points the way the air is travelling, hence the 180 flip.
  const rotation = Number.isFinite(degrees) ? (degrees + 180) % 360 : 0;
  return `<svg class="wi-arrow ${className}" viewBox="0 0 24 24" width="${size}" height="${size}"
    aria-hidden="true" focusable="false" style="transform: rotate(${rotation}deg)">
    <path d="M12 3.5 18 20l-6-4.2L6 20z"/>
  </svg>`;
}

/**
 * Moon phase disc.
 * @param {number} phase 0 = new, 0.5 = full, wrapping at 1
 */
export function moonPhaseIcon(phase, { size = 44 } = {}) {
  const id = `mp-${(uid += 1)}`;
  const illuminated = 1 - Math.abs(1 - 2 * phase); // 0 at new, 1 at full
  const waxing = phase < 0.5;
  const r = 10;
  // The terminator is an ellipse whose x-radius shrinks to zero at quarter.
  const rx = Math.abs(r * (1 - 2 * illuminated));
  const litSide = waxing ? 1 : 0;
  const innerSweep = illuminated > 0.5 ? litSide : 1 - litSide;

  const path = `M12 2 A ${r} ${r} 0 0 ${litSide} 12 22 A ${rx} ${r} 0 0 ${innerSweep} 12 2 Z`;

  return `<svg class="wi-moonphase" viewBox="0 0 24 24" width="${size}" height="${size}"
    aria-hidden="true" focusable="false">
    <defs><clipPath id="${id}"><circle cx="12" cy="12" r="${r}"/></clipPath></defs>
    <circle class="wi-moon-dark" cx="12" cy="12" r="${r}"/>
    <path class="wi-moon-lit" d="${path}" clip-path="url(#${id})"/>
    <circle class="wi-moon-rim" cx="12" cy="12" r="${r}"/>
  </svg>`;
}

/** Small glyphs used on detail tiles. */
const GLYPHS = {
  humidity: 'M12 2.8c3.6 4.3 6 7.5 6 10.3a6 6 0 0 1-12 0c0-2.8 2.4-6 6-10.3z',
  wind: 'M3 8h11a2.6 2.6 0 1 0-2.6-2.6M3 12h15a2.8 2.8 0 1 1-2.8 2.8M3 16h9a2.4 2.4 0 1 1-2.4 2.4',
  gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4.5-5.5',
  eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z',
  uv: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM12 1v2.5M12 20.5V23M1 12h2.5M20.5 12H23',
  drop: 'M12 3c3.4 4.2 5.6 7.2 5.6 9.8a5.6 5.6 0 0 1-11.2 0C6.4 10.2 8.6 7.2 12 3z',
  sunrise: 'M12 4v5M6.5 11.5 8.5 13M17.5 11.5 15.5 13M3 19h18M7.5 19a4.5 4.5 0 0 1 9 0',
  sunset: 'M12 9V4M6.5 11.5 8.5 13M17.5 11.5 15.5 13M3 19h18M7.5 19a4.5 4.5 0 0 1 9 0',
  cloud: 'M7 18h10a4 4 0 0 0 .4-7.98A5.6 5.6 0 0 0 6.4 11.3 3.4 3.4 0 0 0 7 18z',
  thermometer: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z',
  snowflake: 'M12 2v20M3.4 7 20.6 17M20.6 7 3.4 17',
  leaf: 'M20 4C10 4 4 9 4 16c0 2 .8 3.6.8 3.6S9 12 20 4zM4.8 19.6C9 15 14 12.5 20 11',
};

export function glyph(name, { size = 18, className = '' } = {}) {
  const d = GLYPHS[name];
  if (!d) return '';
  return `<svg class="glyph ${className}" viewBox="0 0 24 24" width="${size}" height="${size}"
    aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}
