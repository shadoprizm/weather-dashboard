import SwiftUI
import MapKit

struct RadarView: View {
    let place: Place
    @State private var feed: RadarFeed?
    @State private var frames: [RadarFeed.Frame] = []
    @State private var future = true
    @State private var frameIndex = 0.0
    @State private var playing = false
    @State private var error: String?
    @State private var checked = Date.distantPast
    @State private var requestID = UUID()
    private let timer = Timer.publish(every: 0.8, on: .main, in: .common).autoconnect()
    var frame: RadarFeed.Frame? { frames.at(Int(frameIndex)) }
    var futureAvailable: Bool { feed?.frames.contains { $0.projected && $0.time > Date().timeIntervalSince1970 } == true }
    var recentAvailable: Bool { feed?.frames.contains { !$0.projected } == true }
    var horizon: String {
        if future, let last = frames.last(where: { $0.projected }) {
            return "Future radar · up to \(max(1, Int((last.time - Date().timeIntervalSince1970) / 60))) minutes ahead"
        }
        let last = frames.last(where: { !$0.projected })
        let age = last.map { max(0, Int((Date().timeIntervalSince1970 - $0.time) / 60)) }
        return age.map { "Latest observation · \($0) minutes ago" } ?? "Recent radar unavailable"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading) { Text("Precipitation radar").font(.title2.bold()); Text("Pinch to zoom and drag to explore.").font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Refresh radar")
            }.padding(.horizontal)
            NativeRadar(place: place, feed: feed, frame: frame) {
                playing = false
                error = "Some radar imagery could not load. Try Recent or Refresh."
            }.clipShape(RoundedRectangle(cornerRadius: 22)).padding(.horizontal)
            HStack {
                Button("Recent") { future = false; selectTimeline() }.disabled(!recentAvailable).buttonStyle(.bordered).tint(future ? .secondary : .blue)
                Button("Future") { future = true; selectTimeline() }.disabled(!futureAvailable).buttonStyle(.bordered).tint(future ? .blue : .secondary)
                Spacer()
            }.padding(.horizontal)
            if let error { Text(error).foregroundStyle(.orange).font(.footnote).padding(.horizontal) }
            if let feed, !frames.isEmpty {
                Text(horizon).font(.caption).foregroundStyle(.secondary).padding(.horizontal)
                HStack {
                    Button { playing.toggle() } label: { Image(systemName: playing ? "pause.fill" : "play.fill").frame(width: 36, height: 44) }.disabled(frames.count < 2).accessibilityLabel(playing ? "Pause radar animation" : "Play radar animation")
                    Slider(value: $frameIndex, in: 0...Double(max(1,frames.count - 1)), step: 1, onEditingChanged: { _ in playing = false }).disabled(frames.count < 2).accessibilityLabel("Radar frame")
                    if let frame { VStack(alignment: .trailing) { Text(Date(timeIntervalSince1970: frame.time), style: .time); Text(frame.projected ? "Projected" : "Observed") }.monospacedDigit().font(.caption) }
                }.padding(.horizontal)
                if !futureAvailable { Text(feed.futureUnavailableReason ?? "Future radar is temporarily unavailable.").font(.footnote).foregroundStyle(.secondary).padding(.horizontal) }
            } else if error == nil { ProgressView("Loading radar…").padding(.horizontal) }
            if feed?.provider == "eccc" {
                Link("Radar: Environment Canada / NOAA", destination: URL(string: "https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en/")!).font(.caption).padding(.horizontal)
                Link("ECCC data licence", destination: URL(string: "https://eccc-msc.github.io/open-data/licence/readme_en/")!).font(.caption).padding(.horizontal)
                Text("Future frames project existing radar echoes; storms can grow or fade.").font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
            } else {
                Link("Radar by RainViewer", destination: URL(string: "https://www.rainviewer.com")!).font(.caption).padding(.horizontal)
            }
            Text("An empty area may have no precipitation or no radar coverage. Use official warnings alongside the map.").font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
        }.padding(.vertical).task(id: place.id) { await load() }
            .onReceive(timer) { _ in
                if Date().timeIntervalSince(checked) > 360 { checked = Date(); Task { await load() }; return }
                guard playing, !frames.isEmpty else { return }
                frameIndex = Double((Int(frameIndex) + 1) % frames.count)
            }
            .onDisappear { playing = false }
    }
    func selectTimeline() {
        playing = false; error = nil
        guard let feed else { return }
        let now = Date().timeIntervalSince1970
        let recent = feed.frames.filter { !$0.projected && $0.time <= now }
        let projected = feed.frames.filter { $0.projected && $0.time > now }
        if future && projected.isEmpty { future = false }
        if !future && recent.isEmpty && !projected.isEmpty { future = true }
        let selected = future ? Array(recent.suffix(1)) + projected : recent.filter { $0.time >= (recent.last?.time ?? now) - 7200 }
        frames = selected.count <= 8 ? selected : (0..<8).map { selected[Int((Double($0) * Double(selected.count - 1) / 7).rounded())] }
        frameIndex = future ? 0 : Double(max(0, frames.count - 1))
    }
    func load() async {
        let request = UUID(); requestID = request
        playing = false; error = nil; feed = nil; frames = []; checked = Date()
        do {
            let region = (16.93...67.19).contains(place.latitude) && (-170.32 ... -50).contains(place.longitude) ? "north-america" : "global"
            let value = try await WeatherAPI.get(RadarFeed.self, path: "api/radar", query: ["v":"2", "region":region])
            guard !Task.isCancelled, requestID == request else { return }
            guard value.available, value.safeHost != nil, !value.frames.isEmpty else { error = "Radar is unavailable. Try again shortly."; return }
            feed = value; selectTimeline()
        } catch { if !Task.isCancelled && requestID == request { self.error = "Could not load radar. Check your connection." } }
    }
}

struct NativeRadar: UIViewRepresentable {
    let place: Place
    let feed: RadarFeed?
    let frame: RadarFeed.Frame?
    let onTileFailure: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView(); map.delegate = context.coordinator
        map.isPitchEnabled = false; map.isRotateEnabled = false
        return map
    }
    func updateUIView(_ map: MKMapView, context: Context) {
        if context.coordinator.placeID != place.id {
            context.coordinator.placeID = place.id
            map.setRegion(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude), span: MKCoordinateSpan(latitudeDelta: 4, longitudeDelta: 4)), animated: false)
            map.removeAnnotations(map.annotations)
            let point = MKPointAnnotation(); point.coordinate = CLLocationCoordinate2D(latitude: place.latitude, longitude: place.longitude); point.title = place.name; map.addAnnotation(point)
        }
        let key = frame.map { "\(feed?.provider ?? "rainviewer"):\($0.id):\($0.referenceTime ?? "")" }
        if context.coordinator.frameKey != key {
            context.coordinator.frameKey = key; map.removeOverlays(map.overlays)
            if let feed, let frame {
                let coordinator = context.coordinator
                let overlay = WeatherRadarOverlay(feed: feed, frame: frame) {
                    DispatchQueue.main.async { if coordinator.frameKey == key { onTileFailure() } }
                }
                map.addOverlay(overlay, level: .aboveLabels)
            }
        }
    }
    final class Coordinator: NSObject, MKMapViewDelegate {
        var frameKey: String?; var placeID: String?
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let tile = overlay as? MKTileOverlay else { return MKOverlayRenderer(overlay: overlay) }
            let renderer = MKTileOverlayRenderer(tileOverlay: tile); renderer.alpha = 0.78; return renderer
        }
    }
}

final class WeatherRadarOverlay: MKTileOverlay {
    let feed: RadarFeed
    let frame: RadarFeed.Frame
    let failure: () -> Void
    init(feed: RadarFeed, frame: RadarFeed.Frame, failure: @escaping () -> Void) {
        self.feed = feed; self.frame = frame; self.failure = failure
        super.init(urlTemplate: nil)
        canReplaceMapContent = false; tileSize = CGSize(width: 512, height: 512)
        maximumZ = feed.provider == "eccc" ? 10 : 7
    }
    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, Error?) -> Void) {
        guard let url = feed.tileURL(frame, z: path.z, x: path.x, y: path.y) else {
            failure(); result(nil, URLError(.badURL)); return
        }
        var request = URLRequest(url: url); request.timeoutInterval = 12
        URLSession.shared.dataTask(with: request) { data, response, error in
            guard error == nil, let response = response as? HTTPURLResponse, response.statusCode == 200,
                  response.mimeType == "image/png", let data, UIImage(data: data) != nil else {
                self.failure(); result(nil, error ?? URLError(.cannotDecodeContentData)); return
            }
            result(data, nil)
        }.resume()
    }
}
