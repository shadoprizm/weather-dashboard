# WeatherView Apple launch record

Updated October 10, 2026. The web future-radar release 2.2.0 is live at
https://www.weatherview.cloud. The iPhone/iPad client is a native SwiftUI app,
not a web wrapper.

## Apple listing

- Name: WeatherView; subtitle: Forecasts for everyday plans.
- Bundle: `cloud.weatherview.ios`; version 1.0, build 1.
- App Store Connect: https://appstoreconnect.apple.com/apps/6821165649/distribution
- First devices: iPhone and iPad, iOS/iPadOS 17 or later.
- Free price, Canada as the pricing base. Initial release regions: Canada and
  United States. Mac and Vision Pro availability disabled for this first release.
- Description, promotional text, keywords, Weather category, review instructions,
  copyright and English (Canada) localization entered.
- Age questionnaire completed; Apple calculated 9+ with outdoor lifestyle topics.
- Privacy URL: https://www.weatherview.cloud/privacy.html. Apple confirms the
  Search History declaration is published: app functionality, not linked to
  identity, not used for tracking.
- Review sign-in requirement disabled: there is no login.
- Review contact saved using the owner's approved existing Apple review details.
  Private contact values are not retained in this repository.
- Automatic release after App Review is selected.
- Customer support is available at `/weather-guide#app-support`, including app
  troubleshooting and a public problem-report link. Reports require a GitHub
  account; the page explains their public visibility before the user follows it.

## Verification

Seven native unit checks pass on the iOS 26.5 simulator. Release archive uses
Xcode 26.6 and the iOS 26.5 SDK. iPad manual checks cover Today, ten-day forecast,
native radar geography/precipitation overlays, the 90-minute planner and Apple's
event editor with correct city-local start/end times, an editable one-hour
reminder and cancellation back to the planner. Search is explicitly visible in
the navigation drawer, including iPad modal presentation.

Release evidence and full-device App Store screenshots are saved locally under
`output/releases/apple-1.0/` in the primary checkout. Build, upload and test logs
are outside Git. Xcode confirmed successful upload of version 1.0, build 1, to
App Store Connect at 18:39 EDT on October 9. Apple processed the package and
shows build 1 as Ready to Submit; the build is attached to version 1.0. This
does not establish installed TestFlight or public App Store availability.
Three full-device iPad screenshots and three iPhone screenshots are saved in
the listing. iPhone screenshots use Apple's required medium Dynamic Island
display slot. A signed development build is installed on the owner's paired
iPhone; physical UI/Calendar save and TestFlight checks remain unfinished.
Final phone verification also caught and corrected a server planning boundary:
the complete daylight/night outing must fit between exact solar times, including
the final partial hour. The correction is shared by the web and native clients.

## Remaining public release steps

### October 10 radar update

Web release 2.2.0 uses ECCC / NOAA observed radar and ECCC radar
extrapolation in North America. It projects existing echoes up to 72 minutes
from the source observation, with the actual available time ahead shown in
the UI. No paid radar trial or subscription is required. Build 2 is prepared
and passes eight native unit checks, including the government tile contract;
build 1 remains the processed build currently selected in App Store Connect.
Build 2 still needs native visual verification, upload and selection. Native computer-use access timed out during the October 10 check; this is not a visual test pass. See
[RADAR.md](RADAR.md) for data sources, coverage and failure handling.

The six professional iPhone/iPad marketing images are saved in English
(Canada). They use real app captures and overlays; their radar copy describes
recent precipitation. They do not claim that a future-radar build is already
publicly available.

1. Resolve the provider scope question in [WEATHER_DATA.md](WEATHER_DATA.md).
   Visual Crossing's October 2026 terms permit storage and public viewing, but
   restrict public raw-data retrieval. The open question is how those terms
   apply to WeatherView's first-party forecast endpoints. A targeted inquiry
   covering display, those endpoints and caches was sent with owner approval;
   a written reply has not arrived. This is not a confirmed requirement to buy
   another licence or to obtain fresh permission simply for an iPhone app.
   Establish the applicable rights before certifying Apple's Content Rights.
   Open-Meteo secondary services need the appropriate permitted path if the
   product becomes commercial.
2. On a real iPhone/iPad, check the uploaded build, calendar save/cancel, radar,
   reconnect and persisted preferences. A simulator does not confirm a physical
   device's Calendar integration or TestFlight installation.
3. Once rights and device checks are complete, submit the selected processed build
   for App Review. Public availability follows Apple's approval and release.

Apple's Add for Review validation was run after the review contact and privacy
declaration were completed. The only reported metadata requirement is Content
Rights Information. The truthful selection is third-party content with the
necessary rights; that declaration has not been made while the forecast endpoint
scope is unresolved. Version 1.0 remains Prepare for Submission.

The paired iPhone is available to Xcode. iPhone Mirroring requires an owner
unlock on the device before it can connect; this is an authentication handoff,
not a native test pass. No physical iPad is currently paired with this Mac.

Do not describe a prepared listing or TestFlight upload as an App Store launch.

## Approved provider inquiry sent

Recipient: sales@visualcrossing.com

Subject: WeatherView website and iPhone/iPad display and caching permission

Hello Visual Crossing team,

I operate WeatherView (https://www.weatherview.cloud), a free weather app without
ads or subscriptions, and am preparing its iPhone and iPad release.

Our server fetches Timeline data and caches it for five minutes. Forecast JSON
containing normalized hourly/daily fields and derived outdoor-plan results is
returned through publicly reachable first-party endpoints for our website and
native app. The app also saves each user's last forecast on their device for an
offline view labelled with its timestamp. We display Visual Crossing attribution
and do not resell data or offer bulk datasets.

Please confirm which licence permits public website and App Store display, these
first-party JSON endpoints, the five-minute server cache, and users' on-device
forecast caches. Are these allowed on Metered or Professional, or is another
agreement required? Please also clarify what changes if we later add ads or paid
features.

We would appreciate written confirmation before public Apple distribution.

Thank you,
Jeramy Ratelle

Sent once with explicit owner approval on October 9. Gmail Sent readback verified
the recipient, subject and both plain-text and HTML bodies. The sent message link
is stored in local release evidence; no private account metadata is published here.
