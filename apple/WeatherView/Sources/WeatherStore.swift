import Foundation
import SwiftUI

struct WeatherAPI {
    static let origin = URL(string: "https://www.weatherview.cloud")!
    static func get<T: Decodable>(_ type: T.Type, path: String, query: [String: String] = [:]) async throws -> T {
        var url = URLComponents(url: origin.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        url.queryItems = query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        var request = URLRequest(url: url.url!); request.timeoutInterval = 25
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(type, from: data)
    }
    static func point(_ place: Place) -> [String: String] { ["lat": String(place.latitude), "lon": String(place.longitude)] }
}

@MainActor final class WeatherStore: ObservableObject {
    @Published var places: [Place]
    @Published var selected: Place
    @Published var forecast: Forecast?
    @Published var alerts: AlertFeed?
    @Published var loading = false
    @Published var offline = false
    @Published var message: String?
    @Published var tab = 0
    private var revision = UUID()
    private let defaults = UserDefaults.standard
    init() {
        let saved = defaults.data(forKey: "weather.places").flatMap { try? JSONDecoder().decode([Place].self, from: $0) }
        let initialPlaces = saved?.isEmpty == false ? saved! : Place.starters
        let selectedID = UserDefaults.standard.string(forKey: "weather.selected")
        places = initialPlaces
        selected = initialPlaces.first { $0.id == selectedID } ?? initialPlaces[0]
        forecast = cached(selected)
        offline = forecast != nil
    }
    func cached(_ place: Place) -> Forecast? {
        defaults.data(forKey: "weather.forecast.\(place.id)").flatMap { try? JSONDecoder().decode(Forecast.self, from: $0) }
    }
    func select(_ place: Place) async {
        selected = place; defaults.set(place.id, forKey: "weather.selected")
        forecast = cached(place); alerts = nil; offline = forecast != nil; message = nil
        await refresh()
    }
    func save(_ place: Place) {
        if !places.contains(where: { $0.id == place.id }) { places.append(place); persist() }
    }
    func remove(_ place: Place) {
        guard places.count > 1 else { return }
        places.removeAll { $0.id == place.id }; persist()
        if selected.id == place.id { Task { await select(places[0]) } }
    }
    func clearCache() {
        guard let bundleID = Bundle.main.bundleIdentifier else { return }
        let ownKeys = defaults.persistentDomain(forName: bundleID)?.keys ?? Dictionary<String, Any>().keys
        for key in ownKeys where key.hasPrefix("weather.forecast.") { defaults.removeObject(forKey: key) }
    }
    private func persist() { defaults.set(try? JSONEncoder().encode(places), forKey: "weather.places") }
    func refresh() async {
        let request = UUID(); revision = request
        let place = selected
        loading = true; message = nil
        do {
            let fresh = try await WeatherAPI.get(Forecast.self, path: "api/weather", query: WeatherAPI.point(place))
            guard revision == request else { return }
            forecast = fresh; offline = false
            defaults.set(try? JSONEncoder().encode(fresh), forKey: "weather.forecast.\(place.id)")
            loading = false
            let feed = try? await WeatherAPI.get(AlertFeed.self, path: "api/alerts", query: WeatherAPI.point(place))
            guard revision == request else { return }
            alerts = feed
        } catch {
            guard revision == request else { return }
            offline = forecast != nil
            message = forecast == nil ? "Could not load the forecast. Check your connection and try again." : "Showing your last saved forecast. Reconnect to check current conditions and warnings."
            loading = false
        }
    }
}
