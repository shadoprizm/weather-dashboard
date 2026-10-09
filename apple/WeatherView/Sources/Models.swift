import Foundation

struct Place: Codable, Identifiable, Hashable {
    let name: String
    let latitude: Double
    let longitude: Double
    var admin1: String? = nil
    var country: String? = nil
    var id: String { String(format: "%.3f,%.3f", latitude, longitude) }
    var subtitle: String { [admin1, country].compactMap { $0 }.joined(separator: ", ") }
    static let starters = [Place(name: "Ottawa", latitude: 45.42, longitude: -75.7, admin1: "Ontario", country: "Canada"), Place(name: "Toronto", latitude: 43.65, longitude: -79.38, admin1: "Ontario", country: "Canada"), Place(name: "Vancouver", latitude: 49.28, longitude: -123.12, admin1: "British Columbia", country: "Canada")]
}
struct Geocode: Decodable { let results: [Place] }
struct Forecast: Codable {
    struct Location: Codable { let timezone: String?; let utcOffsetSeconds: Double? }
    struct Current: Codable {
        let time: String
        let temperature_2m: Double?
        let apparent_temperature: Double?
        let weather_code: Int?
        let is_day: Int?
        let wind_speed_10m: Double?
        let relative_humidity_2m: Double?
    }
    struct Hourly: Codable {
        let time: [String]
        let temperature_2m: [Double?]
        let precipitation_probability: [Double?]
        let weather_code: [Int?]
        let wind_speed_10m: [Double?]
    }
    struct Daily: Codable {
        let time: [String]
        let weather_code: [Int?]
        let temperature_2m_max: [Double?]
        let temperature_2m_min: [Double?]
        let precipitation_probability_max: [Double?]
        let sunrise: [String?]
        let sunset: [String?]
    }
    let location: Location
    let current: Current?
    let hourly: Hourly
    let daily: Daily
    let fetchedAt: String
    let weatherProvider: String?
    var zone: TimeZone { location.timezone.flatMap(TimeZone.init(identifier:)) ?? TimeZone(secondsFromGMT: Int(location.utcOffsetSeconds ?? 0)) ?? .gmt }
    var updated: Date? {
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: fetchedAt) ?? ISO8601DateFormatter().date(from: fetchedAt)
    }
    var nextHours: [Int] {
        hourly.time.indices.filter { i in
            guard let date = WeatherClock.date(hourly.time[i], zone: zone) else { return false }
            return date.addingTimeInterval(3600) > Date()
        }.prefix(24).map { $0 }
    }
    func isDay(at hour: Int) -> Bool? {
        guard let value = hourly.time.at(hour), let time = WeatherClock.date(value, zone: zone),
              let day = daily.time.firstIndex(of: String(value.prefix(10))),
              let rise = daily.sunrise.at(day) ?? nil, let set = daily.sunset.at(day) ?? nil,
              let sunrise = WeatherClock.date(rise, zone: zone), let sunset = WeatherClock.date(set, zone: zone) else { return nil }
        return time >= sunrise && time < sunset
    }
}
struct AlertFeed: Decodable {
    struct Bulletin: Decodable, Identifiable {
        let event: String
        let headline: String?
        let description: String?
        let severity: String?
        let source: String?
        let url: String?
        var id: String { event + (headline ?? "") }
    }
    let alerts: [Bulletin]
    let coverage: String?
}
struct OutdoorPlan: Decodable {
    struct Activity: Decodable { let id: String; let label: String; let blurb: String }
    struct Window: Decodable, Identifiable {
        let start: String; let end: String; let duration: Int; let score: Int; let band: String
        let maxRainChance: Double; let maxWind: Double; let minFeels: Double; let maxFeels: Double; let maxCloud: Double
        var id: String { start + end }
    }
    let weatherProvider: String?
    let activity: Activity
    let windows: [Window]
    let status: String
    let timezone: String?
    let utcOffsetSeconds: Double?
    let updatedAt: String?
    var zone: TimeZone { timezone.flatMap(TimeZone.init(identifier:)) ?? TimeZone(secondsFromGMT: Int(utcOffsetSeconds ?? 0)) ?? .gmt }
}
struct RadarFeed: Decodable {
    struct Frame: Decodable, Identifiable {
        let time: Double
        let path: String
        var id: Double { time }
    }
    let available: Bool
    let host: String
    let frames: [Frame]
    var safeHost: String? {
        guard let url = URL(string: host), url.scheme == "https", let hostname = url.host,
              hostname == "rainviewer.com" || hostname.hasSuffix(".rainviewer.com") else { return nil }
        return host
    }
}
enum WeatherClock {
    static func date(_ value: String, zone: TimeZone) -> Date? {
        let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX"); format.timeZone = zone
        format.dateFormat = value.count <= 10 ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm"
        format.isLenient = false
        return format.date(from: String(value.prefix(16)))
    }
    static func label(_ value: String, zone: TimeZone, format: String) -> String {
        guard let date = date(value, zone: zone) else { return value }
        let formatter = DateFormatter(); formatter.timeZone = zone; formatter.dateFormat = format
        return formatter.string(from: date)
    }
    static func temperature(_ value: Double?, imperial: Bool) -> String {
        guard let value else { return "—" }
        return "\(Int((imperial ? value * 1.8 + 32 : value).rounded()))°"
    }
    static func wind(_ value: Double?, imperial: Bool) -> String {
        guard let value else { return "—" }
        return "\(Int((imperial ? value / 1.609344 : value).rounded())) \(imperial ? "mph" : "km/h")"
    }
    static func percent(_ value: Double?) -> String { value.map { "\(Int($0.rounded()))%" } ?? "—" }
    static func condition(_ code: Int?, isDay: Bool? = nil) -> (String, String) {
        switch code {
        case 0: return ("Clear sky", isDay == false ? "moon.stars.fill" : "sun.max.fill")
        case 1,2: return ("Partly cloudy", isDay == false ? "cloud.moon.fill" : "cloud.sun.fill")
        case 3: return ("Overcast", "cloud.fill")
        case 45,48: return ("Fog", "cloud.fog.fill")
        case 51,53,55,56,57: return ("Drizzle", "cloud.drizzle.fill")
        case 61,63,65,66,67,80,81,82: return ("Rain", "cloud.rain.fill")
        case 71,73,75,77,85,86: return ("Snow", "cloud.snow.fill")
        case 95,96,99: return ("Thunderstorms", "cloud.bolt.rain.fill")
        default: return ("Conditions unavailable", "cloud")
        }
    }
}
extension Array {
    func at(_ index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
