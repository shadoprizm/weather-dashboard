import SwiftUI

@main struct WeatherViewApp: App {
    @StateObject private var weather = WeatherStore()
    var body: some Scene { WindowGroup { WeatherRoot().environmentObject(weather).tint(.blue) } }
}
struct WeatherRoot: View {
    @EnvironmentObject var weather: WeatherStore
    @Environment(\.scenePhase) var phase
    @State private var placesOpen = false
    @State private var settingsOpen = false
    @AppStorage("weather.imperial") private var imperial = false
    var body: some View {
        NavigationStack {
            TabView(selection: $weather.tab) {
                ForecastView(imperial: imperial).tabItem { Label("Today", systemImage: "cloud.sun") }.tag(0)
                WeekView(imperial: imperial).tabItem { Label("Week", systemImage: "calendar") }.tag(1)
                RadarView(place: weather.selected).tabItem { Label("Radar", systemImage: "map") }.tag(2)
                PlanView(place: weather.selected, imperial: imperial).tabItem { Label("Plan", systemImage: "figure.walk") }.tag(3)
            }
            .navigationTitle(weather.selected.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button { placesOpen = true } label: { Image(systemName: "list.star") }.accessibilityLabel("Search and saved places") }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { Task { await weather.refresh() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Refresh forecast").disabled(weather.loading)
                    Button { settingsOpen = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
                }
            }
            .sheet(isPresented: $placesOpen) { PlacesView() }
            .sheet(isPresented: $settingsOpen) { SettingsView(imperial: $imperial) }
            .task { await weather.refresh() }
            .onChange(of: phase) { _, value in
                if value == .active, let updated = weather.forecast?.updated, Date().timeIntervalSince(updated) > 600 { Task { await weather.refresh() } }
            }
        }
    }
}
struct ForecastView: View {
    @EnvironmentObject var weather: WeatherStore
    let imperial: Bool
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let message = weather.message { Label(message, systemImage: "wifi.slash").font(.callout).padding().background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 16)) }
                if let forecast = weather.forecast {
                    if let alerts = weather.alerts, !alerts.alerts.isEmpty {
                        ForEach(alerts.alerts) { alert in
                            VStack(alignment: .leading, spacing: 8) {
                                Label(alert.event, systemImage: "exclamationmark.triangle.fill").font(.headline)
                                Text(alert.headline ?? alert.description ?? "Read the official bulletin for details.").font(.callout)
                                if let text = alert.url, let url = URL(string: text), url.scheme == "https" { Link("Read \(alert.source ?? "official") bulletin", destination: url) }
                            }.padding().background(.orange.opacity(0.15), in: RoundedRectangle(cornerRadius: 18))
                        }
                    }
                    if let current = forecast.current {
                        let condition = WeatherClock.condition(current.weather_code, isDay: current.is_day.map { $0 == 1 })
                        VStack(alignment: .leading, spacing: 12) {
                            Text(weather.selected.subtitle).foregroundStyle(.secondary)
                            HStack(spacing: 22) {
                                Image(systemName: condition.1).symbolRenderingMode(.hierarchical).foregroundStyle(.blue).font(.system(size: 72)).accessibilityHidden(true)
                                VStack(alignment: .leading) {
                                    Text(WeatherClock.temperature(current.temperature_2m, imperial: imperial)).font(.system(size: 72, weight: .light, design: .rounded))
                                    Text(condition.0).font(.title3.weight(.semibold))
                                }
                            }
                            Text("Feels like \(WeatherClock.temperature(current.apparent_temperature, imperial: imperial)) · \(imperial ? "Fahrenheit" : "Celsius")")
                            HStack { Label(WeatherClock.wind(current.wind_speed_10m, imperial: imperial), systemImage: "wind"); Spacer(); Label(WeatherClock.percent(current.relative_humidity_2m), systemImage: "humidity") }.foregroundStyle(.secondary)
                            if let updated = forecast.updated { Text("\(weather.offline ? "Saved" : "Updated") \(updated.formatted(.relative(presentation: .named)))").font(.caption).foregroundStyle(.secondary) }
                        }.padding(24).frame(maxWidth: .infinity, alignment: .leading).background(LinearGradient(colors: [.blue.opacity(0.16), .cyan.opacity(0.06)], startPoint: .topLeading, endPoint: .bottomTrailing), in: RoundedRectangle(cornerRadius: 26))
                    }
                    Text("The next 24 hours").font(.title2.bold())
                    Text("Times in \(weather.selected.name)").font(.caption).foregroundStyle(.secondary)
                    ScrollView(.horizontal) {
                        HStack(spacing: 12) {
                            ForEach(forecast.nextHours, id: \.self) { i in
                                VStack(spacing: 10) {
                                    Text(WeatherClock.label(forecast.hourly.time[i], zone: forecast.zone, format: "ha")).font(.caption)
                                    Image(systemName: WeatherClock.condition(forecast.hourly.weather_code.at(i) ?? nil, isDay: forecast.isDay(at: i)).1).symbolRenderingMode(.hierarchical).foregroundStyle(.blue).font(.title2)
                                    Text(WeatherClock.temperature(forecast.hourly.temperature_2m.at(i) ?? nil, imperial: imperial)).font(.title3.bold())
                                    Label(WeatherClock.percent(forecast.hourly.precipitation_probability.at(i) ?? nil), systemImage: "drop.fill").font(.caption).foregroundStyle(.blue)
                                }.padding(14).frame(minWidth: 86).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 18))
                            }
                        }
                    }
                    Button { weather.tab = 3 } label: { Label("Find a time for an outdoor plan", systemImage: "figure.walk") }.buttonStyle(.borderedProminent).controlSize(.large)
                    sources(forecast)
                } else if weather.loading { ProgressView("Loading your forecast…").frame(maxWidth: .infinity).padding(50) }
            }.padding(20).frame(maxWidth: 850).frame(maxWidth: .infinity)
        }.refreshable { await weather.refresh() }
    }
    func sources(_ forecast: Forecast) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Link(forecast.weatherProvider == "visual-crossing" ? "Weather Data Provided by Visual Crossing" : "Weather data by Open-Meteo", destination: URL(string: forecast.weatherProvider == "visual-crossing" ? "https://www.visualcrossing.com" : "https://open-meteo.com")!)
            Text("Warning coverage varies by country. Always check your national weather service before an outdoor activity.")
            Link("Open this forecast on WeatherView", destination: webURL(weather.selected))
            ShareLink(item: webURL(weather.selected)) { Label("Share forecast", systemImage: "square.and.arrow.up") }
        }.font(.footnote).foregroundStyle(.secondary)
    }
}
func webURL(_ place: Place) -> URL {
    var url = URLComponents(string: "https://www.weatherview.cloud")!
    url.queryItems = [URLQueryItem(name: "lat", value: String(place.latitude)), URLQueryItem(name: "lon", value: String(place.longitude)), URLQueryItem(name: "name", value: place.name)]
    return url.url!
}
struct WeekView: View {
    @EnvironmentObject var weather: WeatherStore
    let imperial: Bool
    var body: some View {
        List {
            if weather.offline { Text("Saved forecast — reconnect to refresh.").foregroundStyle(.orange) }
            if let forecast = weather.forecast {
                ForEach(forecast.daily.time.indices.prefix(10), id: \.self) { i in
                    HStack(spacing: 16) {
                        Text(WeatherClock.label(forecast.daily.time[i], zone: forecast.zone, format: "EEE, MMM d")).font(.headline).frame(minWidth: 100, alignment: .leading)
                        Image(systemName: WeatherClock.condition(forecast.daily.weather_code.at(i) ?? nil).1).symbolRenderingMode(.hierarchical).foregroundStyle(.blue).font(.title2).frame(width: 32)
                        Spacer()
                        VStack(alignment: .trailing) {
                            Text("\(WeatherClock.temperature(forecast.daily.temperature_2m_max.at(i) ?? nil, imperial: imperial)) / \(WeatherClock.temperature(forecast.daily.temperature_2m_min.at(i) ?? nil, imperial: imperial))")
                            Label(WeatherClock.percent(forecast.daily.precipitation_probability_max.at(i) ?? nil), systemImage: "drop").font(.caption).foregroundStyle(.secondary)
                        }
                    }.padding(.vertical, 8)
                }
                Link(forecast.weatherProvider == "visual-crossing" ? "Weather Data Provided by Visual Crossing" : "Weather data by Open-Meteo", destination: URL(string: forecast.weatherProvider == "visual-crossing" ? "https://www.visualcrossing.com" : "https://open-meteo.com")!).font(.footnote)
                Text("Forecast confidence decreases further ahead. Times and dates are local to \(weather.selected.name).").font(.footnote).foregroundStyle(.secondary)
            } else { Text("Load a forecast in Today to see the week ahead.") }
        }.refreshable { await weather.refresh() }
    }
}
struct PlacesView: View {
    @EnvironmentObject var weather: WeatherStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Place] = []
    @State private var searching = false
    @State private var message: String?
    var body: some View {
        NavigationStack {
            List {
                if !query.isEmpty {
                    Section("Search results") {
                        if searching { ProgressView("Searching…") }
                        if let message { Text(message).foregroundStyle(.secondary) }
                        ForEach(results) { place in placeButton(place) }
                    }
                }
                Section("Saved places") {
                    ForEach(weather.places) { place in placeButton(place).swipeActions { if weather.places.count > 1 { Button("Remove", role: .destructive) { weather.remove(place) } } } }
                }
                Text("Places stay on this device. Search by city, region or country.").font(.footnote).foregroundStyle(.secondary)
            }.navigationTitle("Your places")
                .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search any city")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
                .task(id: query) {
                    let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
                    results = []; message = nil
                    guard term.count >= 2 else { searching = false; return }
                    searching = true
                    do {
                        try await Task.sleep(for: .milliseconds(350))
                        let data = try await WeatherAPI.get(Geocode.self, path: "api/geocode", query: ["q": term])
                        guard !Task.isCancelled else { return }
                        results = data.results; searching = false
                        if results.isEmpty { message = "No matching cities. Try adding the region or country." }
                    } catch { if !Task.isCancelled { searching = false; message = "Search is unavailable. Check your connection." } }
                }
        }
    }
    func placeButton(_ place: Place) -> some View {
        Button {
            weather.save(place); dismiss(); Task { await weather.select(place) }
        } label: {
            HStack { VStack(alignment: .leading) { Text(place.name).foregroundStyle(.primary); Text(place.subtitle).font(.caption).foregroundStyle(.secondary) }; Spacer(); if weather.selected.id == place.id { Image(systemName: "checkmark") } }
        }
    }
}
struct SettingsView: View {
    @EnvironmentObject var weather: WeatherStore
    @Environment(\.dismiss) private var dismiss
    @Binding var imperial: Bool
    var body: some View {
        NavigationStack {
            Form {
                Section("Forecast preferences") { Toggle("Fahrenheit and miles", isOn: $imperial) }
                Section("On this device") {
                    Text("Saved places, plan preferences and your last forecast are stored locally. No account is required.")
                    Button("Clear saved forecasts") { weather.clearCache() }
                    Text("Calendar plans open Apple's event editor. You choose whether to save; WeatherView cannot read your calendar.")
                }
                Section("WeatherView") {
                    Link("WeatherView website", destination: WeatherAPI.origin)
                    Link("Privacy policy", destination: URL(string: "https://www.weatherview.cloud/privacy")!)
                    Link("Help reading the forecast", destination: URL(string: "https://www.weatherview.cloud/weather-guide")!)
                    Text("WeatherView 1.0 · Free, without ads").foregroundStyle(.secondary)
                }
            }.navigationTitle("Settings").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
