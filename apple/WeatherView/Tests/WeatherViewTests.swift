import XCTest
@testable import WeatherView

final class WeatherViewTests: XCTestCase {
    func testForecastDatesUseTheCityTimeZone() throws {
        let toronto = try XCTUnwrap(TimeZone(identifier: "America/Toronto"))
        let formatter = ISO8601DateFormatter()
        XCTAssertEqual(WeatherClock.date("2026-10-09", zone: toronto), formatter.date(from: "2026-10-09T04:00:00Z"))
        XCTAssertEqual(WeatherClock.date("2026-03-08T03:00", zone: toronto), formatter.date(from: "2026-03-08T07:00:00Z"))
        XCTAssertEqual(WeatherClock.label("2026-10-10T00:30", zone: toronto, format: "EEE"), "Sat")
    }
    func testMissingMeasurementsNeverLookLikeZero() {
        XCTAssertEqual(WeatherClock.temperature(nil, imperial: false), "—")
        XCTAssertEqual(WeatherClock.percent(nil), "—")
        XCTAssertEqual(WeatherClock.wind(nil, imperial: true), "—")
        XCTAssertEqual(WeatherClock.temperature(0, imperial: true), "32°")
        let values: [Double?] = [nil, 0, 21]
        XCTAssertNil(values.at(999))
        XCTAssertEqual(values.at(1)!, 0)
    }
    func testPlanContractSupportsNoFitAndOvernightWindows() throws {
        let noFit = Data(#"{"activity":{"id":"run","label":"Go for a run","blurb":"Cool, calm and dry"},"windows":[],"status":"no-fit","timezone":"America/Toronto","utcOffsetSeconds":-14400,"updatedAt":"2026-10-09T22:00:00Z"}"#.utf8)
        let plan = try JSONDecoder().decode(OutdoorPlan.self, from: noFit)
        XCTAssertEqual(plan.status, "no-fit")
        XCTAssertTrue(plan.windows.isEmpty)
        let window = Data(#"{"start":"2026-10-09T23:00","end":"2026-10-10T00:30","duration":90,"score":89,"band":"good","maxRainChance":3,"maxWind":8,"minFeels":11,"maxFeels":12,"maxCloud":10}"#.utf8)
        let value = try JSONDecoder().decode(OutdoorPlan.Window.self, from: window)
        let start = try XCTUnwrap(WeatherClock.date(value.start, zone: plan.zone))
        let end = try XCTUnwrap(WeatherClock.date(value.end, zone: plan.zone))
        XCTAssertEqual(end.timeIntervalSince(start), 5400)
    }
    func testRadarCannotLoadAnUntrustedTileHost() throws {
        for host in ["http://tilecache.rainviewer.com", "https://rainviewer.com.attacker.example", "https://example.com"] {
            let feed = try JSONDecoder().decode(RadarFeed.self, from: JSONSerialization.data(withJSONObject: ["available":true,"host":host,"frames":[]]))
            XCTAssertNil(feed.safeHost)
        }
        let trusted = try JSONDecoder().decode(RadarFeed.self, from: Data(#"{"available":true,"host":"https://tilecache.rainviewer.com","frames":[]}"#.utf8))
        XCTAssertNotNil(trusted.safeHost)
    }
    func testForecastTimestampKeepsItsAge() throws {
        let json = Data(#"{"location":{"timezone":"America/Toronto","utcOffsetSeconds":-14400},"current":null,"hourly":{"time":[],"temperature_2m":[],"precipitation_probability":[],"weather_code":[],"wind_speed_10m":[]},"daily":{"time":[],"weather_code":[],"temperature_2m_max":[],"temperature_2m_min":[],"precipitation_probability_max":[],"sunrise":[],"sunset":[]},"fetchedAt":"2026-10-09T22:00:00.123Z","weatherProvider":"visual-crossing"}"#.utf8)
        let forecast = try JSONDecoder().decode(Forecast.self, from: json)
        XCTAssertNotNil(forecast.updated, "Saved forecasts must always show their age")
        XCTAssertTrue(forecast.nextHours.isEmpty)
    }
    func testSavedCityIdentityIsStable() {
        let a = Place(name: "Toronto", latitude: 43.65, longitude: -79.38)
        let b = Place(name: "Toronto, Ontario", latitude: 43.65001, longitude: -79.38001)
        XCTAssertEqual(a.id, b.id)
    }
    func testClearConditionsAtNightDoNotShowSunshine() {
        XCTAssertEqual(WeatherClock.condition(0, isDay: false).1, "moon.stars.fill")
        XCTAssertEqual(WeatherClock.condition(2, isDay: false).1, "cloud.moon.fill")
        XCTAssertEqual(WeatherClock.condition(0, isDay: true).1, "sun.max.fill")
    }
}
