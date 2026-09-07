# Weather data release gate

Last reviewed: September 7, 2026. Provider terms and pricing can change; check
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

1. Get written confirmation from Visual Crossing that WeatherView may return a
   normalized, same-origin JSON forecast response to its own browser client on
   the intended plan. Its public pricing page permits commercial and
   public-facing display, but reserves "storable for shared external use" for
   Enterprise. Our response is a transient display API, not a download product,
   but that distinction should be confirmed rather than inferred.
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

Before launch, email `sales@visualcrossing.com` with this exact question:

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

- [ ] Written Visual Crossing response retained, or a different commercial
      provider selected.
- [ ] Forecast, fallback, air quality, geocoding and archive use all licensed.
- [ ] Provider attribution matches the purchased plan and appears wherever
      required.
- [ ] `COMMERCIAL_MODE=1` set in production and `/api/health` reports usable
      licensed services.
- [ ] Privacy notice names direct BigDataCloud geolocation lookup.
- [ ] Provider limits and expected per-visitor query cost are load-tested.
- [ ] Monitoring and story-retention terms are approved separately from public
      display rights.
