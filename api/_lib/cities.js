'use strict';

/**
 * The curated location catalogue behind `/weather/{city}`.
 *
 * These are the pages that exist as real URLs: they are in the sitemap, they
 * are server-rendered, and each one is a genuine destination rather than a
 * keyword doorway. Everything *outside* this list still works — the search box
 * reaches every place the geocoder knows — it simply is not published as its
 * own indexable page.
 *
 * That distinction is deliberate. Generating a page per populated place on
 * Earth would produce a few hundred thousand near-identical URLs, which is
 * exactly the "scaled content" pattern search engines treat as spam. Growing
 * this file city by city, where each addition is somewhere people actually
 * live and search for, is the honest version of the same idea.
 *
 * Columns: name, region code, country code, latitude, longitude, [slug].
 * The slug is derived from the name and only stated explicitly where two
 * cities would otherwise collide (London ON vs London UK, Portland OR vs ME).
 */

const REGIONS = {
  // Canada
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
  // United States
  AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', AZ: 'Arizona', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DC: 'District of Columbia', DE: 'Delaware',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', IA: 'Iowa', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  MA: 'Massachusetts', MD: 'Maryland', ME: 'Maine', MI: 'Michigan',
  MN: 'Minnesota', MO: 'Missouri', MS: 'Mississippi', MT: 'Montana',
  NC: 'North Carolina', ND: 'North Dakota', NE: 'Nebraska', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NV: 'Nevada', NY: 'New York',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VA: 'Virginia', VT: 'Vermont', WA: 'Washington',
  WI: 'Wisconsin', WV: 'West Virginia', WY: 'Wyoming',
};

const COUNTRIES = {
  CA: 'Canada', US: 'United States', GB: 'United Kingdom', IE: 'Ireland',
  FR: 'France', DE: 'Germany', ES: 'Spain', IT: 'Italy', NL: 'Netherlands',
  AU: 'Australia', NZ: 'New Zealand', JP: 'Japan', SG: 'Singapore',
  HK: 'Hong Kong', IN: 'India', AE: 'United Arab Emirates',
  ZA: 'South Africa', NG: 'Nigeria', MX: 'Mexico', BR: 'Brazil',
};

/* eslint-disable no-multi-spaces */
const ROWS = [
  // --- Canada ------------------------------------------------------------
  ['Toronto',           'ON', 'CA',  43.6532,  -79.3832],
  ['Montreal',          'QC', 'CA',  45.5019,  -73.5674],
  ['Vancouver',         'BC', 'CA',  49.2827, -123.1207],
  ['Calgary',           'AB', 'CA',  51.0447, -114.0719],
  ['Edmonton',          'AB', 'CA',  53.5461, -113.4938],
  ['Ottawa',            'ON', 'CA',  45.4215,  -75.6972],
  ['Winnipeg',          'MB', 'CA',  49.8951,  -97.1384],
  ['Quebec City',       'QC', 'CA',  46.8139,  -71.2080],
  ['Hamilton',          'ON', 'CA',  43.2557,  -79.8711],
  ['Mississauga',       'ON', 'CA',  43.5890,  -79.6441],
  ['Brampton',          'ON', 'CA',  43.7315,  -79.7624],
  ['Surrey',            'BC', 'CA',  49.1913, -122.8490],
  ['Kitchener',         'ON', 'CA',  43.4516,  -80.4925],
  ['Halifax',           'NS', 'CA',  44.6488,  -63.5752],
  ['Laval',             'QC', 'CA',  45.6066,  -73.7124],
  ['London',            'ON', 'CA',  42.9849,  -81.2453, 'london-on'],
  ['Victoria',          'BC', 'CA',  48.4284, -123.3656],
  ['Markham',           'ON', 'CA',  43.8561,  -79.3370],
  ['Vaughan',           'ON', 'CA',  43.8361,  -79.4983],
  ['Gatineau',          'QC', 'CA',  45.4765,  -75.7013],
  ['Windsor',           'ON', 'CA',  42.3149,  -83.0364],
  ['Saskatoon',         'SK', 'CA',  52.1332, -106.6700],
  ['Regina',            'SK', 'CA',  50.4452, -104.6189],
  ['Burnaby',           'BC', 'CA',  49.2488, -122.9805],
  ['Oshawa',            'ON', 'CA',  43.8971,  -78.8658],
  ['Barrie',            'ON', 'CA',  44.3894,  -79.6903],
  ['Kelowna',           'BC', 'CA',  49.8880, -119.4960],
  ['Abbotsford',        'BC', 'CA',  49.0504, -122.3045],
  ['Sherbrooke',        'QC', 'CA',  45.4042,  -71.8929],
  ['Guelph',            'ON', 'CA',  43.5448,  -80.2482],
  ['Kingston',          'ON', 'CA',  44.2312,  -76.4860],
  ["St. John's",        'NL', 'CA',  47.5615,  -52.7126, 'st-johns'],
  ['Sudbury',           'ON', 'CA',  46.4917,  -80.9930],
  ['Thunder Bay',       'ON', 'CA',  48.3809,  -89.2477],
  ['Moncton',           'NB', 'CA',  46.0878,  -64.7782],
  ['Saint John',        'NB', 'CA',  45.2733,  -66.0633],
  ['Fredericton',       'NB', 'CA',  45.9636,  -66.6431],
  ['Charlottetown',     'PE', 'CA',  46.2382,  -63.1311],
  ['Trois-Rivieres',    'QC', 'CA',  46.3432,  -72.5432],
  ['Red Deer',          'AB', 'CA',  52.2681, -113.8112],
  ['Lethbridge',        'AB', 'CA',  49.6956, -112.8451],
  ['Kamloops',          'BC', 'CA',  50.6745, -120.3273],
  ['Nanaimo',           'BC', 'CA',  49.1659, -123.9401],
  ['Prince George',     'BC', 'CA',  53.9171, -122.7497],
  ['Niagara Falls',     'ON', 'CA',  43.0896,  -79.0849],
  ['Peterborough',      'ON', 'CA',  44.3091,  -78.3197],
  ['Sault Ste. Marie',  'ON', 'CA',  46.5136,  -84.3358, 'sault-ste-marie'],
  ['Whitehorse',        'YT', 'CA',  60.7212, -135.0568],
  ['Yellowknife',       'NT', 'CA',  62.4540, -114.3718],
  ['Iqaluit',           'NU', 'CA',  63.7467,  -68.5170],

  // --- United States -----------------------------------------------------
  ['New York',          'NY', 'US',  40.7128,  -74.0060],
  ['Los Angeles',       'CA', 'US',  34.0522, -118.2437],
  ['Chicago',           'IL', 'US',  41.8781,  -87.6298],
  ['Houston',           'TX', 'US',  29.7604,  -95.3698],
  ['Phoenix',           'AZ', 'US',  33.4484, -112.0740],
  ['Philadelphia',      'PA', 'US',  39.9526,  -75.1652],
  ['San Antonio',       'TX', 'US',  29.4241,  -98.4936],
  ['San Diego',         'CA', 'US',  32.7157, -117.1611],
  ['Dallas',            'TX', 'US',  32.7767,  -96.7970],
  ['San Jose',          'CA', 'US',  37.3382, -121.8863],
  ['Austin',            'TX', 'US',  30.2672,  -97.7431],
  ['Jacksonville',      'FL', 'US',  30.3322,  -81.6557],
  ['Fort Worth',        'TX', 'US',  32.7555,  -97.3308],
  ['Columbus',          'OH', 'US',  39.9612,  -82.9988],
  ['Charlotte',         'NC', 'US',  35.2271,  -80.8431],
  ['Indianapolis',      'IN', 'US',  39.7684,  -86.1581],
  ['San Francisco',     'CA', 'US',  37.7749, -122.4194],
  ['Seattle',           'WA', 'US',  47.6062, -122.3321],
  ['Denver',            'CO', 'US',  39.7392, -104.9903],
  ['Washington',        'DC', 'US',  38.9072,  -77.0369, 'washington-dc'],
  ['Boston',            'MA', 'US',  42.3601,  -71.0589],
  ['El Paso',           'TX', 'US',  31.7619, -106.4850],
  ['Nashville',         'TN', 'US',  36.1627,  -86.7816],
  ['Detroit',           'MI', 'US',  42.3314,  -83.0458],
  ['Oklahoma City',     'OK', 'US',  35.4676,  -97.5164],
  ['Portland',          'OR', 'US',  45.5152, -122.6784, 'portland-or'],
  ['Las Vegas',         'NV', 'US',  36.1699, -115.1398],
  ['Memphis',           'TN', 'US',  35.1495,  -90.0490],
  ['Louisville',        'KY', 'US',  38.2527,  -85.7585],
  ['Baltimore',         'MD', 'US',  39.2904,  -76.6122],
  ['Milwaukee',         'WI', 'US',  43.0389,  -87.9065],
  ['Albuquerque',       'NM', 'US',  35.0844, -106.6504],
  ['Tucson',            'AZ', 'US',  32.2226, -110.9747],
  ['Fresno',            'CA', 'US',  36.7378, -119.7871],
  ['Sacramento',        'CA', 'US',  38.5816, -121.4944],
  ['Kansas City',       'MO', 'US',  39.0997,  -94.5786],
  ['Atlanta',           'GA', 'US',  33.7490,  -84.3880],
  ['Omaha',             'NE', 'US',  41.2565,  -95.9345],
  ['Colorado Springs',  'CO', 'US',  38.8339, -104.8214],
  ['Raleigh',           'NC', 'US',  35.7796,  -78.6382],
  ['Miami',             'FL', 'US',  25.7617,  -80.1918],
  ['Virginia Beach',    'VA', 'US',  36.8529,  -75.9780],
  ['Oakland',           'CA', 'US',  37.8044, -122.2712],
  ['Minneapolis',       'MN', 'US',  44.9778,  -93.2650],
  ['Tulsa',             'OK', 'US',  36.1540,  -95.9928],
  ['Tampa',             'FL', 'US',  27.9506,  -82.4572],
  ['New Orleans',       'LA', 'US',  29.9511,  -90.0715],
  ['Cleveland',         'OH', 'US',  41.4993,  -81.6944],
  ['Honolulu',          'HI', 'US',  21.3069, -157.8583],
  ['Anchorage',         'AK', 'US',  61.2181, -149.9003],
  ['St. Louis',         'MO', 'US',  38.6270,  -90.1994, 'st-louis'],
  ['Pittsburgh',        'PA', 'US',  40.4406,  -79.9959],
  ['Cincinnati',        'OH', 'US',  39.1031,  -84.5120],
  ['Orlando',           'FL', 'US',  28.5383,  -81.3792],
  ['Salt Lake City',    'UT', 'US',  40.7608, -111.8910],
  ['Buffalo',           'NY', 'US',  42.8864,  -78.8784],
  ['Boise',             'ID', 'US',  43.6150, -116.2023],
  ['Des Moines',        'IA', 'US',  41.5868,  -93.6250],
  ['Richmond',          'VA', 'US',  37.5407,  -77.4360],
  ['Providence',        'RI', 'US',  41.8240,  -71.4128],
  ['Hartford',          'CT', 'US',  41.7658,  -72.6734],
  ['Charleston',        'SC', 'US',  32.7765,  -79.9311, 'charleston-sc'],
  ['Birmingham',        'AL', 'US',  33.5186,  -86.8104],
  ['Little Rock',       'AR', 'US',  34.7465,  -92.2896],
  ['Jackson',           'MS', 'US',  32.2988,  -90.1848],
  ['Wichita',           'KS', 'US',  37.6872,  -97.3301],
  ['Billings',          'MT', 'US',  45.7833, -108.5007],
  ['Fargo',             'ND', 'US',  46.8772,  -96.7898],
  ['Sioux Falls',       'SD', 'US',  43.5460,  -96.7313],
  ['Burlington',        'VT', 'US',  44.4759,  -73.2121],
  ['Portland',          'ME', 'US',  43.6591,  -70.2568, 'portland-me'],
  ['Manchester',        'NH', 'US',  42.9956,  -71.4548],
  ['Cheyenne',          'WY', 'US',  41.1400, -104.8202],
  ['Reno',              'NV', 'US',  39.5296, -119.8138],
  ['Spokane',           'WA', 'US',  47.6588, -117.4260],
  ['Newark',            'NJ', 'US',  40.7357,  -74.1724],
  ['Wilmington',        'DE', 'US',  39.7459,  -75.5466],
  ['Charleston',        'WV', 'US',  38.3498,  -81.6326, 'charleston-wv'],
  ['Lexington',         'KY', 'US',  38.0406,  -84.5037],

  // --- Elsewhere ---------------------------------------------------------
  ['London',            null, 'GB',  51.5074,   -0.1278],
  ['Dublin',            null, 'IE',  53.3498,   -6.2603],
  ['Paris',             null, 'FR',  48.8566,    2.3522],
  ['Berlin',            null, 'DE',  52.5200,   13.4050],
  ['Madrid',            null, 'ES',  40.4168,   -3.7038],
  ['Rome',              null, 'IT',  41.9028,   12.4964],
  ['Amsterdam',         null, 'NL',  52.3676,    4.9041],
  ['Sydney',            null, 'AU', -33.8688,  151.2093],
  ['Melbourne',         null, 'AU', -37.8136,  144.9631],
  ['Auckland',          null, 'NZ', -36.8485,  174.7633],
  ['Tokyo',             null, 'JP',  35.6762,  139.6503],
  ['Singapore',         null, 'SG',   1.3521,  103.8198],
  ['Hong Kong',         null, 'HK',  22.3193,  114.1694],
  ['Mumbai',            null, 'IN',  19.0760,   72.8777],
  ['Delhi',             null, 'IN',  28.6139,   77.2090],
  ['Dubai',             null, 'AE',  25.2048,   55.2708],
  ['Johannesburg',      null, 'ZA', -26.2041,   28.0473],
  ['Lagos',             null, 'NG',   6.5244,    3.3792],
  ['Mexico City',       null, 'MX',  19.4326,  -99.1332],
  ['Sao Paulo',         null, 'BR', -23.5505,  -46.6333],
];
/* eslint-enable no-multi-spaces */

/** Lowercase, ASCII, hyphenated — the shape a URL segment should be. */
function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const CITIES = ROWS.map(([name, region, country, latitude, longitude, slug]) => ({
  slug: slug || slugify(name),
  name,
  regionCode: region,
  region: region ? REGIONS[region] : null,
  countryCode: country,
  country: COUNTRIES[country] || country,
  latitude,
  longitude,
  /**
   * What the page calls the place in prose: "Toronto, Ontario" reads better
   * than "Toronto, ON", and a country-level entry has no region at all.
   */
  label: region ? `${name}, ${REGIONS[region]}` : `${name}, ${COUNTRIES[country] || country}`,
  shortLabel: region ? `${name}, ${region}` : name,
}));

const BY_SLUG = new Map(CITIES.map((city) => [city.slug, city]));

// A duplicate slug would silently shadow a city, so fail loudly at load.
if (BY_SLUG.size !== CITIES.length) {
  const seen = new Set();
  const dupes = CITIES.map((c) => c.slug).filter((s) => (seen.has(s) ? true : (seen.add(s), false)));
  throw new Error(`Duplicate city slugs: ${[...new Set(dupes)].join(', ')}`);
}

function bySlug(slug) {
  return BY_SLUG.get(String(slug || '').toLowerCase()) || null;
}

/** Great-circle distance in kilometres. */
function distanceKm(aLat, aLon, bLat, bLon) {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The catalogue city closest to a point, if one is close enough to be the
 * same place. Used to point an arbitrary coordinate at its canonical page.
 */
function nearest(lat, lon, { withinKm = 60 } = {}) {
  let best = null;
  let bestKm = Infinity;
  for (const city of CITIES) {
    const km = distanceKm(lat, lon, city.latitude, city.longitude);
    if (km < bestKm) { bestKm = km; best = city; }
  }
  return best && bestKm <= withinKm ? { city: best, km: bestKm } : null;
}

/** Catalogue cities grouped by country, for the index page. */
function byCountry() {
  const groups = new Map();
  for (const city of CITIES) {
    if (!groups.has(city.countryCode)) {
      groups.set(city.countryCode, { code: city.countryCode, name: city.country, cities: [] });
    }
    groups.get(city.countryCode).cities.push(city);
  }
  return [...groups.values()];
}

module.exports = { CITIES, REGIONS, COUNTRIES, bySlug, nearest, byCountry, slugify, distanceKm };
