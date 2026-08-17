# SkyWatch

A self-hosted weather service. No ads, no autoplay video, no cookie wall, no
"unlock the 14-day forecast" upsell — just a dense, fast, detailed forecast
that belongs to you.

Vanilla JavaScript ES modules, one dependency (Express, and only for local
dev), no build step. Deploys to Vercel as static files plus a handful of
serverless functions.

```bash
npm install
npm start          # http://localhost:3000
npm test           # views + parsers, offline
npm run verify     # checks the live upstream providers
```

## What it does

**Forecast**
- Current conditions with feels-like, dew point, pressure trend, visibility,
  UV, cloud cover and gusts
- 48-hour hourly strip with a temperature curve and precipitation-probability
  bars; click any of the next 14 days to load that day hour by hour
- 14-day outlook with proportional high/low range bars
- Metric ⇄ imperial toggle that re-renders instantly (data is always fetched
  in metric and converted client-side, so one cache entry serves everyone)

**The briefing** — a plain-language summary written from the raw numbers:
when precipitation starts and stops, where the temperature is heading, whether
the wind is the story, what tomorrow looks like relative to today.

**Live radar** — animated precipitation with a nowcast, on a slippy map built
from scratch in ~300 lines. Drag to pan, scroll to zoom, scrub the timeline.

**Alerts** — official government warnings from Environment Canada and the
US National Weather Service, plus locally computed watches (heat, cold, wind,
snow, rainfall, freezing rain, thunderstorms, fog, frost, UV, air quality)
that work everywhere on Earth. Computed watches are labelled as such and
never dressed up as official.

**Best time to…** — every hour of the next two days scored for running,
walking the dog, cycling, patio weather, gardening, line-drying laundry,
stargazing and golden-hour photography, then reduced to the best window.

**Sun & moon** — sunrise/sunset with a live sun-position arc, day length and
how much it changed since yesterday, golden hour, moon phase drawn from the
synodic cycle, a stargazing score for tonight, and an aurora watch driven by
NOAA's planetary K index.

**Air quality** — AQI with the pollutant breakdown, plus pollen where the
upstream model covers it.

**Almanac** — today against 20 years of records for the same calendar day:
normal high and low, record high and low with their years, typical rainfall,
and the odds of a wet day. This is what makes "18°" mean something.

**Your locations, ranked** — saved cities sorted by how pleasant it is to be
outside in each of them right now.

Keyboard: `/` search · `u` units · `r` refresh · `1`–`9` switch location.

## Architecture

```
index.html            Shell and panel mount points
style.css             Design system: tokens, sky themes, components
js/
  main.js             Data loading, state wiring, render orchestration
  api.js              Client for this app's own /api/* proxy
  state.js            Units, saved locations, theme (localStorage)
  format.js           Unit conversion and display formatting
  wmo.js              WMO code → label, icon, sky theme, intensity
  icons.js            Hand-built SVG weather icons and glyphs
  insights.js         Narrative, activity scoring, watches, moon, comfort
  radar.js            Dependency-free slippy map + radar animation
  dom.js              Escaping, delegation, small helpers
  views/forecast.js   Hero, briefing, hourly, details, daily
  views/panels.js     Alerts, activities, astro, air, almanac, compare
api/
  _lib/handlers.js    Transport-agnostic request handlers
  _lib/alerts/        Alert providers (nws, eccc) + merge registry
  _lib/xml.js         Minimal XML reader for ECCC's feeds
  _lib/upstream.js    Outbound fetch with timeouts and soft failure
  _lib/cache.js       In-process TTL cache
  _lib/serve.js       Vercel function adapter
  *.js                One thin file per route
server.js             Local dev server, mounts the same handlers
scripts/              Live upstream verification (npm run verify)
test/                 Smoke tests, parser tests, forecast fixture
```

Two things are worth calling out:

**The views are pure functions** from view-model to HTML string. They never
touch the network or global state. That is why `npm test` can exercise the
entire render path in Node against a synthetic forecast — no browser, no
network, no mocking framework.

**Local dev and production run the same code.** `server.js` and the Vercel
functions both mount `api/_lib/handlers.js`. There is no "works locally,
breaks on deploy" gap.

## Data sources

| Source | Used for | Key required |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Forecast, air quality, geocoding, historical archive | No |
| [RainViewer](https://www.rainviewer.com/) | Radar frames and tiles | No |
| [NWS](https://www.weather.gov/documentation/services-web-api) | Official US alerts | No |
| [ECCC](https://eccc-msc.github.io/open-data/) | Official Canadian alerts | No |
| [NOAA SWPC](https://www.swpc.noaa.gov/) | Planetary K index | No |
| [CARTO](https://carto.com/attributions) / [OpenStreetMap](https://www.openstreetmap.org/copyright) | Radar base map tiles | No |
| [BigDataCloud](https://www.bigdatacloud.com/) | Reverse geocoding | No |

Every call is proxied through `/api/*`, so the browser only ever talks to your
own origin. That keeps the CSP tight (`connect-src 'self'`), lets the CDN cache
responses, and means no third party sees your visitors' IP addresses.

### Alert coverage

| Region | Provider | How |
|---|---|---|
| Canada | Environment and Climate Change Canada | Nearest citypage site's `<warnings>` block |
| United States | National Weather Service | Point-queryable GeoJSON alerts API |
| Everywhere else | — | Locally computed watches only |

Providers live in `api/_lib/alerts/`. Each exports
`{ id, label, covers(lat, lon), fetchAlerts(lat, lon) }` and returns the
normalised shape `{ id, event, headline, description, instruction, severity,
onset, expires, area, sender, url, source }`. `alerts/index.js` queries every
provider whose bounds contain the point, concurrently, and merges the results.
Adding a country is one module plus one line in the registry.

**How the Canadian lookup works.** ECCC has no point-queryable alert API.
Warnings ship either as CAP XML in a date/office/hour directory tree on the
MSC Datamart — which would mean crawling directories and testing polygons on
every request — or inside the per-site citypage XML. SkyWatch uses the
citypage route: it fetches `site_list_en.csv` once a week, finds the nearest
of the ~880 named sites, and reads the `<warnings>` block from that site's
document. Two cacheable requests instead of a crawl.

Two consequences worth knowing:

- Warnings are reported for the **nearest named site**, not for your exact
  coordinates. ECCC issues by forecast region and the named site anchors that
  region, so they normally agree — but the lookup refuses any point more than
  150 km from a site rather than report something misleading.
- Border cities legitimately match both providers. Detroit sits 5 km from
  Windsor, so you may see an ECCC warning next to an NWS one. Each card is
  labelled with its source and area, and that cross-border view is usually
  what you want.

The citypage feed carries the warning headline and a link to the full
bulletin, not the bulletin text, so Canadian alerts render as a headline plus
a "Read the full bulletin" link. NWS alerts include the complete text inline.

### Verifying the upstream providers

The parsers are unit-tested against captured payloads, but formats drift and
only a live check proves the real endpoints still match:

```bash
npm run verify                    # defaults to Ottawa
npm run verify -- 43.65 -79.38    # any lat/lon
```

It checks every field the UI reads, confirms a radar tile actually renders at
the URL template the app builds, and exits non-zero if a required assumption
broke. Optional providers only warn, because the app already degrades
gracefully when they are down. Worth running after any upstream outage, or on
a schedule.

## API

| Endpoint | Purpose | CDN cache |
|---|---|---|
| `GET /api/weather?lat=&lon=` | Forecast + air quality | 5 min |
| `GET /api/geocode?q=` | Place search | 24 h |
| `GET /api/reverse?lat=&lon=` | Coordinates → place name | 24 h |
| `GET /api/alerts?lat=&lon=` | Official alerts | 3 min |
| `GET /api/radar` | Radar frame index | 2 min |
| `GET /api/almanac?lat=&lon=&date=` | 20-year normals and records | 24 h |
| `GET /api/space` | Planetary K index | 15 min |
| `GET /api/health` | Health and cache stats | — |

## Deploying

Push to a Vercel-connected repository. `vercel.json` sets the CSP and security
headers and disables the build step; `api/*.js` are picked up as Node
functions automatically. Nothing to configure, no environment variables, no
API keys.

## Ideas not yet built

Roughly in order of value for effort:

1. **Commute-cast** — save two times and two places; get a one-line verdict
   for each leg of the day.
2. **Push alerts** — a Web Push subscription so severe watches reach your
   phone. Needs a cron function and a small subscription store.
3. **Lightning proximity** — strike density near the point, from a public
   sferics feed.
4. **Snow-day / school-bus index** — a Canadian-winter composite of snowfall
   rate, wind chill, visibility and freezing rain.
5. **Historical charts** — "this month vs the last 20 Augusts" as a small
   multiple. The archive endpoint already returns the data.
6. **Ski and rink conditions** — base depth, freeze-thaw cycles, and a
   backyard-rink index from consecutive sub-zero nights.
7. **Model disagreement** — Open-Meteo exposes multiple weather models; a
   spread indicator would show when forecasters are actually guessing.
8. **Shareable forecast cards** — render the hero panel to a PNG for sharing.
9. **Offline mode** — a service worker caching the last good forecast.

## Attribution and licence

Weather data by [Open-Meteo](https://open-meteo.com/), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Radar imagery by
RainViewer. Base map tiles by CARTO, data © OpenStreetMap contributors.

MIT.
