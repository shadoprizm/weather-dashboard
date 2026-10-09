# Weather data release gate

Last reviewed: October 9, 2026. Provider terms and pricing can change; check
the linked primary sources again before signing or changing the product's
commercial status.

## Current decision

WeatherView remains a non-commercial prototype until a paid or otherwise
commercially permitted forecast path is configured. The code makes that
boundary explicit:

- `COMMERCIAL_MODE=0` permits the public Open-Meteo endpoints for prototyping.
- `COMMERCIAL_MODE=1` refuses every Open-Meteo call unless
  `OPEN_METEO_API_KEY` is present.
- Supplying `OPEN_METEO_API_KEY` switches forecast, air quality, geocoding and
  archive calls to Open-Meteo's `customer-` hosts and adds the key server-side.
- Visual Crossing can be selected with `WEATHER_PROVIDER=visual-crossing`; its
  key remains server-only. Open-Meteo fallback is disabled in commercial mode
  unless the paid key is also configured.

The preferred launch path is:

1. Establish whether the existing Visual Crossing licence covers WeatherView's
   normalized, first-party forecast endpoints. Public display and storage are
   permitted in its current published terms, but public raw-data retrieval is
   restricted. A targeted clarification was sent to Visual Crossing with owner
   approval on October 9; retain its answer with account records. Written
   clarification is a precaution for this implementation, not a confirmed new
   licence requirement simply because a native Apple client is being launched.
2. If confirmed, use Visual Crossing as the primary forecast and purchase the
   capacity appropriate to measured traffic.
3. Buy Open-Meteo Standard as the fallback and for air quality/geocoding, or
   replace those secondary services. Almanac/archive access requires the plan
   documented by Open-Meteo for historical data.
4. Set `COMMERCIAL_MODE=1` in production only after the necessary keys are in
   place. `/api/health` reports the active primary and whether Open-Meteo is on
   a licensed customer endpoint without exposing a key.

## Provider findings

### Open-Meteo

Open-Meteo's [terms](https://open-meteo.com/en/terms) limit its free hosted API
to non-commercial use and classify subscriptions or advertising as commercial.
Its [pricing](https://open-meteo.com/en/pricing) documents paid customer access;
the forecast, air-quality, geocoding and historical API documentation specifies
the `customer-` server prefix and `apikey` parameter for customer endpoints.

The data licences and the hosted API terms are separate. Attribution alone does
not turn free hosted access into commercial permission.

### Visual Crossing

Visual Crossing's [pricing](https://www.visualcrossing.com/weather-data-pricing/)
currently marks commercial use and public-facing display as permitted across
its plans and requires attribution on Free, Metered and Professional. It also
distinguishes display from data that is storable for shared external use.

The current [October 2026 terms](https://www.visualcrossing.com/weather-service-terms/)
permit data storage in section 10, while section 11 restricts public raw-data
retrieval and section 13 restricts competing weather data services. Use the
singular `weather-service-terms` URL: the older plural URL still serves January
2023 terms and should not be treated as the current account agreement.

Its [storage and caching guide](https://www.visualcrossing.com/resources/documentation/can-i-cache-and-store-visual-crossing-weather-data/)
distinguishes an application cache from a public data service and an archived
forecast from current operational data. WeatherView keeps its provider key
server-side and labels offline forecasts as saved. The remaining account-specific
question is its publicly reachable forecast endpoints, not a general prohibition
on storing a forecast. Current account plan and any separate agreement must also
be verified before certifying content rights.

The expanded inquiry in [APPLE_LAUNCH.md](APPLE_LAUNCH.md) was sent once to
`sales@visualcrossing.com` with owner approval. It supersedes this earlier question:

> WeatherView fetches Timeline data on its server, normalizes only the fields
> needed by its forecast UI, caches the response for five minutes, and returns
> that transient JSON to its own first-party browser client. Visitors cannot
> request bulk data or download provider payloads. Is this permitted on the
> Metered or Professional plan, including public website display, or does it
> require Enterprise "storable for shared external use" rights?

Retain the written answer with the account records.

### BigDataCloud reverse geocoding

BigDataCloud documents `reverse-geocode-client` as a browser/client-side
endpoint and prohibits sending those requests from a server. WeatherView now
calls it only after the visitor clicks **Use my location** and grants browser
geolocation permission. The removed `/api/reverse` proxy must not be restored.
That direct request discloses the visitor's IP address and selected coordinates
to BigDataCloud and must be named in the privacy notice before launch.

### Apple WeatherKit

[WeatherKit](https://developer.apple.com/weatherkit/) is a viable fallback
option for websites and includes a monthly request allowance with Apple
Developer Program membership. Its attribution, temporary-caching and
no-secondary-database requirements make it a less natural fit for WeatherView's
current server cache, monitoring evidence and story snapshot workflow, so it is
not the first choice.

## Launch checklist

- [x] Targeted Visual Crossing inquiry sent with owner approval and verified in Sent.
- [ ] Applicable provider scope established from the existing agreement, a written
      clarification, or a different permitted provider path.
- [ ] Forecast, fallback, air quality, geocoding and archive use all licensed.
- [ ] Provider attribution matches the purchased plan and appears wherever
      required.
- [ ] `COMMERCIAL_MODE=1` set in production and `/api/health` reports usable
      licensed services.
- [ ] Privacy notice names direct BigDataCloud geolocation lookup.
- [ ] Provider limits and expected per-visitor query cost are load-tested.
- [ ] Monitoring and story-retention terms are approved separately from public
      display rights.
