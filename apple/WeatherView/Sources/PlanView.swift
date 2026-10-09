import SwiftUI
import EventKit
import EventKitUI

struct PlanView: View {
    @EnvironmentObject var weather: WeatherStore
    let place: Place
    let imperial: Bool
    @AppStorage("weather.plan.activity") private var activity = "run"
    @AppStorage("weather.plan.duration") private var duration = 60
    @AppStorage("weather.plan.time") private var timeOfDay = "daylight"
    @State private var plan: OutdoorPlan?
    @State private var loading = false
    @State private var message: String?
    @State private var calendarPlan: CalendarPlan?
    static let activities = [("run", "Go for a run"), ("walk", "Walk the dog"), ("cycle", "Ride a bike"), ("patio", "Patio or BBQ"), ("garden", "Garden work"), ("laundry", "Line-dry laundry"), ("stargaze", "Stargazing"), ("photo", "Golden-hour photos")]
    var requestKey: String { "\(place.id)-\(activity)-\(duration)-\(timeOfDay)" }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Make an outdoor plan").font(.largeTitle.bold())
                Text("Choose what you want to do and how long you need. Find a good fit in the next 48 hours.").foregroundStyle(.secondary)
                VStack(spacing: 10) {
                    Picker("Activity", selection: $activity) { ForEach(Self.activities, id: \.0) { item in Text(item.1).tag(item.0) } }
                    Picker("Duration", selection: $duration) { ForEach([30,60,90,120,180], id: \.self) { value in Text("\(value) minutes").tag(value) } }
                    Picker("Time of day", selection: $timeOfDay) { Text("Daylight").tag("daylight"); Text("Any time").tag("any"); Text("Night").tag("night") }
                }.pickerStyle(.menu).padding().frame(maxWidth: .infinity).background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 20))
                Text("All times are local to \(place.name). Preferences stay on this device.").font(.footnote).foregroundStyle(.secondary)
                if weather.alerts?.alerts.contains(where: { ["Severe", "Extreme"].contains($0.severity ?? "") }) == true {
                    Label("Official warnings are active. Read the bulletin in Today before making outdoor plans.", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                }
                if loading { ProgressView("Finding a good fit…").frame(maxWidth: .infinity) }
                if let message { Text(message).padding().background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 16)) }
                if let plan {
                    if plan.windows.isEmpty { Text(plan.status == "unavailable" ? "Not enough complete hourly data to suggest a time. Try refreshing." : "No full \(duration)-minute window fits these conditions. Try a shorter duration or another time of day.").padding() }
                    ForEach(Array(plan.windows.enumerated()), id: \.element.id) { index, window in
                        VStack(alignment: .leading, spacing: 14) {
                            Text("\(index == 0 ? "Best fit" : "Another option") · \(window.band == "good" ? "Good" : "Fair") conditions").font(.subheadline.bold()).foregroundStyle(window.band == "good" ? .green : .secondary)
                            Text("\(WeatherClock.label(window.start, zone: plan.zone, format: "EEE, MMM d · h:mm a"))–\(WeatherClock.label(window.end, zone: plan.zone, format: window.start.prefix(10) == window.end.prefix(10) ? "h:mm a" : "EEE h:mm a"))").font(.title3.bold())
                            Label("Feels like \(WeatherClock.temperature(window.minFeels, imperial: imperial))–\(WeatherClock.temperature(window.maxFeels, imperial: imperial))", systemImage: "thermometer.medium")
                            Label("Highest hourly rain chance \(WeatherClock.percent(window.maxRainChance))", systemImage: "drop")
                            Label("Wind up to \(WeatherClock.wind(window.maxWind, imperial: imperial))", systemImage: "wind")
                            if plan.activity.id == "stargaze" { Label("Cloud cover up to \(WeatherClock.percent(window.maxCloud))", systemImage: "cloud") }
                            Button { openCalendar(window, plan: plan) } label: { Label("Add to calendar", systemImage: "calendar.badge.plus") }.buttonStyle(.borderedProminent)
                        }.padding(22).frame(maxWidth: .infinity, alignment: .leading).background(.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 22))
                    }
                    DisclosureGroup("How these suggestions work") {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("\(plan.activity.blurb). We compare feels-like temperature, precipitation chance and wind. Every hour of the outing must meet the activity's minimum score. The highest average fit comes first.")
                            Text("Garden work, laundry and golden-hour photos need daylight; stargazing needs darkness. Photos also need an hour near sunrise or sunset. These suggestions use forecasts, not observations of the route. Check the latest forecast and official warnings before going out.")
                        }.font(.footnote).foregroundStyle(.secondary).padding(.top)
                    }
                    Link(plan.weatherProvider == "open-meteo" ? "Weather data by Open-Meteo" : "Weather Data Provided by Visual Crossing", destination: URL(string: plan.weatherProvider == "open-meteo" ? "https://open-meteo.com" : "https://www.visualcrossing.com")!).font(.footnote)
                }
            }.padding(20).frame(maxWidth: 850).frame(maxWidth: .infinity)
        }
        .task(id: requestKey) { await load() }
        .onChange(of: activity) { _, value in timeOfDay = value == "stargaze" ? "night" : "daylight" }
        .refreshable { await load() }
        .fullScreenCover(item: $calendarPlan) { CalendarEditor(plan: $0).ignoresSafeArea() }
    }
    func load() async {
        plan = nil; message = nil; loading = true
        var query = WeatherAPI.point(place)
        query.merge(["activity": activity, "duration": String(duration), "timeOfDay": timeOfDay]) { _, next in next }
        do {
            let value = try await WeatherAPI.get(OutdoorPlan.self, path: "api/plan", query: query)
            guard !Task.isCancelled else { return }
            plan = value; loading = false
        } catch { if !Task.isCancelled { message = "Could not load current plan suggestions. Check your connection and try again."; loading = false } }
    }
    func openCalendar(_ window: OutdoorPlan.Window, plan: OutdoorPlan) {
        guard let start = WeatherClock.date(window.start, zone: plan.zone), let end = WeatherClock.date(window.end, zone: plan.zone), start > Date(), abs(end.timeIntervalSince(start) - Double(window.duration * 60)) < 1 else {
            message = "That window has passed or crosses a clock change. Refresh to choose a current suggestion."; return
        }
        calendarPlan = CalendarPlan(title: "\(plan.activity.label) — \(place.name)", place: place.name, start: start, end: end, notes: "Feels like \(WeatherClock.temperature(window.minFeels, imperial: imperial))–\(WeatherClock.temperature(window.maxFeels, imperial: imperial)). Highest hourly rain chance \(WeatherClock.percent(window.maxRainChance)); wind up to \(WeatherClock.wind(window.maxWind, imperial: imperial)).\nBased on a WeatherView forecast. Check the latest forecast and official warnings before going out.")
    }
}
struct CalendarPlan: Identifiable {
    let id = UUID()
    let title: String; let place: String; let start: Date; let end: Date; let notes: String
}
struct CalendarEditor: UIViewControllerRepresentable {
    let plan: CalendarPlan
    @Environment(\.dismiss) private var dismiss
    func makeCoordinator() -> Coordinator { Coordinator(dismiss: { dismiss() }) }
    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        event.title = plan.title; event.location = plan.place
        event.startDate = plan.start; event.endDate = plan.end; event.notes = plan.notes
        event.addAlarm(EKAlarm(relativeOffset: -3600))
        let editor = EKEventEditViewController(); editor.eventStore = store; editor.event = event; editor.editViewDelegate = context.coordinator
        return editor
    }
    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}
    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let dismiss: () -> Void
        init(dismiss: @escaping () -> Void) { self.dismiss = dismiss }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { dismiss() }
    }
}
