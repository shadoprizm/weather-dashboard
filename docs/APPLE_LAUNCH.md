# WeatherView Apple launch record

Prepared October 9, 2026. The web planning release 2.1 is live at
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
- Privacy URL: https://www.weatherview.cloud/privacy.html. Search History preview:
  app functionality, not linked to identity, not used for tracking.
- Review sign-in requirement disabled: there is no login.

## Verification

Seven native unit checks pass on the iOS 26.5 simulator. Release archive uses
Xcode 26.6 and the iOS 26.5 SDK. iPad manual checks cover Today, ten-day forecast,
native radar geography/precipitation overlays, the 90-minute planner and Apple's
event editor with correct city-local start/end times, an editable one-hour
reminder and cancellation back to the planner. Search is explicitly visible in
the navigation drawer, including iPad modal presentation.

Release evidence and full-device App Store screenshots are saved locally under
`output/releases/apple-1.0/` in the primary checkout. Build, upload and test logs
are outside Git. Record confirmed upload/processing status here after Apple
accepts the binary; an archive alone does not confirm delivery.

## Public release steps still requiring owner/provider input

1. Resolve the provider display/storage gate in [WEATHER_DATA.md](WEATHER_DATA.md).
   Visual Crossing's pricing permits public-facing display, but its current
   storage clause requires permission under the applicable licence. Confirm both
   five-minute first-party JSON and the native app's on-device last-forecast
   cache in writing. This is an unresolved scope question, not a finding that
   the account is licensed for native storage. Do not certify content rights
   without evidence. Open-Meteo secondary services also need the appropriate
   permitted path if the product becomes commercial.
2. Fill Apple's required review contact name, phone and email. Reuse existing
   account contact details only with approval to transmit them to this listing.
3. Publish the prepared Apple privacy answers after the owner approves Apple's
   accuracy/compliance attestation.
4. On a real iPhone/iPad, check the uploaded build, calendar save/cancel, radar,
   reconnect and persisted preferences. A simulator does not confirm a physical
   device's Calendar integration or TestFlight installation.
5. Once rights and metadata are complete, choose the processed build and submit
   for App Review. Public availability follows Apple's approval and release.

Do not describe a prepared listing or TestFlight upload as an App Store launch.

## Provider email for owner review only

Recipient: sales@visualcrossing.com

Subject: WeatherView website and iPhone/iPad display and caching permission

Hello Visual Crossing team,

I operate WeatherView (https://www.weatherview.cloud), a free weather app without
ads or subscriptions, and am preparing its native iPhone and iPad release.

Our server fetches Timeline data, normalizes the fields needed for our forecast
and outdoor planning screens, caches the forecast response for five minutes,
and returns that JSON only to our own website and native app. The native app
keeps the last forecast on the user's device so an offline view can show its
timestamp. We display Visual Crossing attribution; we do not offer bulk data
or downloadable provider payloads.

Please confirm which licence permits public website and App Store display,
the five-minute server cache and each user's on-device last-forecast cache.
Are these allowed on Metered or Professional, or is another agreement required?
Please also distinguish any permission needed if we later add ads or paid
features. We would appreciate a written answer before public Apple distribution.

Thank you,
Jeramy Ratelle

This draft has not been sent. User approval of the recipients, subject and full
message is required before sending.
