# WeatherView for iPhone and iPad

Native SwiftUI client for WeatherView's first-party HTTPS services. Requires
iOS/iPadOS 17 or later. Version 1.0, build 1, bundle `cloud.weatherview.ios`.

## Features

- Current conditions, the next 24 hours, ten-day forecast and official bulletins.
- Search and saved cities, Celsius/km/h or Fahrenheit/mph, local forecast cache
  with an explicit saved/updated timestamp.
- Native Apple Maps with RainViewer precipitation frames and animation.
- The same activity/duration/daylight planning engine as the website. Apple's
  event editor reviews a selected future window before saving it, with an
  editable one-hour reminder. The app never requests calendar read access.
- Native sharing, pull-to-refresh, foreground refresh and system appearance.

No account, advertising SDK, web analytics module or GPS permission is required.
City search is transmitted to the server and its search-result cache; preferences
and saved forecasts remain in this app's on-device UserDefaults domain.

## Build and test

Create a dedicated QA simulator in Xcode first, or select an available simulator
in the destination argument below. Run from the repository root with the full Xcode developer directory. Do not
change the machine's global command-line tools selection.

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodegen generate --spec apple/WeatherView/project.yml
xcodebuild -project apple/WeatherView/WeatherView.xcodeproj \
  -scheme WeatherView -destination 'platform=iOS Simulator,name=WeatherView iPad QA' \
  -derivedDataPath output/apple-build test
```

The generated project and shared scheme are checked in. Regenerate after adding
files or changing `project.yml`. There are no external Swift package dependencies.
Seven unit checks cover city dates/DST, nullable measurements, saved identity,
planner contracts, forecast age, nighttime icons and trusted radar hosts.

## Distribution

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project apple/WeatherView/WeatherView.xcodeproj \
  -scheme WeatherView -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath output/apple-release -archivePath output/WeatherView.xcarchive \
  -allowProvisioningUpdates archive
xcodebuild -exportArchive -archivePath output/WeatherView.xcarchive \
  -exportOptionsPlist apple/WeatherView/ExportOptions.plist \
  -exportPath output/apple-upload -allowProvisioningUpdates
```

Export options upload to the existing Apple team using Xcode's signed-in account.
Increment `CURRENT_PROJECT_VERSION` before a subsequent upload. Keep credentials,
archives, test results and device screenshots out of Git.

The privacy manifest declares app-domain UserDefaults (CA92.1) and Search History
for app functionality, without identity linking or tracking. The native client
sends selected public-city coordinates; it does not obtain the device's location.

See [the launch record](../../docs/APPLE_LAUNCH.md) for listing status, evidence
and outstanding owner/provider steps before public distribution.
