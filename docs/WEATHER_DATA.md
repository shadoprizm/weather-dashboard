# Weather data release architecture

Reviewed October 13, 2026. Web 2.4.0 and Apple build 3 remove the public Visual Crossing forecast feed. This supersedes the earlier prototype/provider-email release hold.

## Public forecasts

`/api/weather` returns normalized MET Norway Locationforecast data, licensed for copying, modification and redistribution under CC BY 4.0 / NLOD 2.0. The response includes attribution, a licence link, modification notes and the source update time. WeatherView localizes timestamps, converts wind units, summarizes available daily model samples and calculates solar times locally. Values the provider does not supply remain null. The current panel is labelled a forecast estimate; later time steps can be six-hourly and are not interpolated into invented hourly observations.

The server identifies WeatherView in its User-Agent, rounds coordinates to four decimals, combines concurrent requests, respects `Expires`, and uses exact `Last-Modified` validators after expiry. The Vercel runtime cache shares upstream results across regional function instances; the CDN and bounded in-process cache also absorb repeated requests. This is best-effort open government infrastructure, with no SLA or guaranteed unlimited capacity. No subscription is purchased for this release.

Sources: [MET Norway licence](https://api.met.no/doc/License), [API terms](https://api.met.no/doc/TermsOfService), [forecast documentation](https://api.met.no/weatherapi/locationforecast/2.0/documentation).

## Visual Crossing: derived recommendations only

Visual Crossing input rows remain inside the server. `planningForecast` is an internal function and is not an HTTP route. `/api/plan` and the optional `activityPlan` in the public forecast return at most three activity-sized recommendations for the next 48 hours: selected windows, suitability scores and aggregated reasons. They do not return current/hourly/daily provider arrays or an arbitrary date-range data feed. The browser and native app display the recommendation's provider attribution; exported recommendation text/cards retain that credit.

The provider confirmed on October 13 that all its licences support commercial use. Sections 11 and 13 of its published terms permit derived analyses, recommendations and summaries in customer-facing products, with attribution. The implementation now follows that path instead of treating the public raw-data endpoint as implicitly permitted. The API key stays server-side. The follow-up email already sent is no longer a prerequisite for this implementation.

If Visual Crossing fails or reaches its capacity, recommendations fall back to MET Norway. Where hourly probability is missing, the planner uses supplied precipitation amounts with an additional intensity penalty, explicitly labels amounts, and never reports a missing probability as 0%. Incomplete weather or solar coverage cannot qualify an outing. A planning failure does not take down the independently licensed public forecast.

Sources: [Visual Crossing terms, sections 11–13](https://www.visualcrossing.com/weather-service-terms/), [caching/application-use guide](https://www.visualcrossing.com/resources/documentation/can-i-cache-and-store-visual-crossing-weather-data/).

## Place search and optional services

Default place search uses a bundled GeoNames cities1000 index, under CC BY 4.0 with commercial redistribution permission. It includes 171,226 populated places, country/region/timezone and alternate names. It does not use a hosted API quota or disclose search terms to GeoNames. Source details and original download hashes are retained in `data/GEONAMES.md`.

Open-Meteo hosted services require `OPEN_METEO_API_KEY` on release paths. The free prototype endpoints are no longer used for place search, public forecasts, planning fallback or archive requests. Historical/almanac and air-quality panels are optional and remain unavailable unless an appropriate licensed source is configured. Buying a subscription is not part of this release.

The browser's opt-in reverse lookup still calls BigDataCloud's browser/client endpoint directly, as its documented usage requires. The native app does not request GPS permission.

## Radar and native distribution

North American observed/extrapolated radar uses ECCC GeoMet, with source and licence attribution. RainViewer's current free API states personal/educational use only; its fallback is disabled unless the operator separately establishes rights and sets `RAINVIEWER_LICENSED=1`. Outside the government domain or during an outage, the app reports that imagery is unavailable. It never fabricates radar or equates missing coverage with no precipitation. Initial Apple availability remains Canada and the US.

[Government data licence](https://eccc-msc.github.io/open-data/licence/readme_en/), [RainViewer API terms](https://www.rainviewer.com/api.html).

Apple build 3 updates source credits, forecast-estimate wording, amount-based precipitation labels and saved-forecast cache generation. Saved cities and preferences remain intact. Native raw forecast sharing opens a link to the attributed public view. Prepared assets, upload, Content Rights completion and actual App Review status must be verified separately; source changes or an archive alone do not constitute submission.
