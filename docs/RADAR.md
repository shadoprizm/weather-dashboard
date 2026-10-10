# Observed and future radar

WeatherView 2.2 adds Environment and Climate Change Canada's free North American
radar composite and radar extrapolation. This is radar-based motion projection,
not a numerical weather forecast map. It follows existing precipitation echoes;
it does not predict their growth, decay or new storm formation.

Official source and integration guide:
https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en/

Data licence:
https://eccc-msc.github.io/open-data/licence/readme_en/

## Timing and coverage

- Observations: `RADAR_1KM_RRAI`, three hours of six-minute frames. The visible
  Recent timeline samples the last two hours, retaining the newest observation.
- Projections: `Radar_1km_RainPrecipRate-Extrapolation`, six-minute steps through
  72 minutes from the radar reference time. Every GetMap request pins both
  `TIME` and `DIM_REFERENCE_TIME` to prevent mixed runs. The available minutes
  ahead are measured against the current time, rather than advertised as a
  fixed 72 minutes from whenever a visitor opens the app.
- Both use 1 km North American composites, including Canadian and US radar.
  The metadata bounds are longitude -170.32 to -50 and latitude 16.93 to 67.19;
  this is a product domain, not a promise of radar coverage at every point.
  Blank pixels can mean no precipitation or no radar coverage.
- Metadata requires `layer` plus `LAYERS_REFRESH_RATE=PT1M` to retrieve fresh
  dimensions. WMS time strings must omit fractional seconds. GeoMet can return
  an XML service error with HTTP 200; image decode/content-type checks matter.

## Cost and failure behaviour

No paid radar subscription, trial or per-user API key is configured. ECCC grants
royalty-free reuse, including commercial use, with attribution. The app links
the source and licence. Hosting still has its normal costs, and the public
service provides no uptime warranty.

The shared `/api/radar?v=2&region=north-america` index caches metadata for one
minute and combines concurrent refreshes. Clients request only visible map tiles
directly from GeoMet and sample the full horizon within their frame budget.
Web animation loads and decodes complete frames before enabling playback.
Native overlays reject XML/undecodable images and show a visible failure message.

An extrapolation failure keeps available recent radar. Last-good government
data can bridge an outage only while its observation/reference time is within
30 minutes. If no fresh government imagery remains, RainViewer supplies recent
radar and Future is visibly unavailable. Outside the North American domain,
RainViewer continues to supply history. Neither path fabricates future imagery
or treats provider failure as dry weather.

The unversioned `/api/radar` response stays compatible with Apple build 1 and
older web clients. Apple 1.0 build 2 requests the same version 2 index as the web.

## Verification

`npm test` includes radar metadata parsing, expired runs, provider outages,
concurrent requests, complete-horizon sampling, geographic tile bounds and
trusted URL checks. Native tests cover the government feed contract, trusted
host, pinned reference and Web Mercator coordinates. Release verification must
also check actual future PNGs and the visible map on a narrow viewport.
