import SwiftUI
import MapKit

struct RadarView: View {
    let place: Place
    @State private var feed: RadarFeed?
    @State private var frameIndex = 0.0
    @State private var playing = false
    @State private var error: String?
    private let timer = Timer.publish(every: 0.8, on: .main, in: .common).autoconnect()
    var frame: RadarFeed.Frame? { feed?.frames.at(Int(frameIndex)) }
    var template: String? {
        guard let host = feed?.safeHost, let frame, frame.path.hasPrefix("/v2/radar/") else { return nil }
        return "\(host)\(frame.path)/512/{z}/{x}/{y}/2/1_1.png"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading) { Text("Precipitation radar").font(.title2.bold()); Text("Pinch to zoom and drag to explore.").font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") }.accessibilityLabel("Refresh radar")
            }.padding(.horizontal)
            NativeRadar(place: place, template: template).clipShape(RoundedRectangle(cornerRadius: 22)).padding(.horizontal)
            if let error { Text(error).foregroundStyle(.orange).padding(.horizontal) }
            if let feed, !feed.frames.isEmpty {
                HStack {
                    Button { playing.toggle() } label: { Image(systemName: playing ? "pause.fill" : "play.fill").frame(width: 36, height: 44) }.accessibilityLabel(playing ? "Pause radar animation" : "Play radar animation")
                    Slider(value: $frameIndex, in: 0...Double(max(1,feed.frames.count - 1)), step: 1).accessibilityLabel("Radar frame")
                    if let frame { Text(Date(timeIntervalSince1970: frame.time), style: .time).monospacedDigit().font(.caption) }
                }.padding(.horizontal)
                Text((frame?.time ?? 0) > Date().timeIntervalSince1970 ? "Predicted precipitation frame" : "Recent precipitation frame").font(.caption).foregroundStyle(.secondary).padding(.horizontal)
            } else if error == nil { ProgressView("Loading radar…").padding(.horizontal) }
            Link("Radar by RainViewer", destination: URL(string: "https://www.rainviewer.com")!).font(.caption).padding(.horizontal)
            Text("Radar shows precipitation where coverage is available. An empty area may have no rain or no radar coverage. Use the forecast and official warnings alongside the map.").font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
        }.padding(.vertical).task(id: place.id) { await load() }
            .onReceive(timer) { _ in guard playing, let feed, !feed.frames.isEmpty else { return }; frameIndex = Double((Int(frameIndex) + 1) % feed.frames.count) }
            .onDisappear { playing = false }
    }
    func load() async {
        playing = false; error = nil
        do {
            let value = try await WeatherAPI.get(RadarFeed.self, path: "api/radar")
            guard !Task.isCancelled else { return }
            guard value.available, value.safeHost != nil, !value.frames.isEmpty else { error = "Radar is unavailable. Try again shortly."; feed = nil; return }
            feed = value; frameIndex = Double(value.frames.lastIndex(where: { $0.time <= Date().timeIntervalSince1970 }) ?? 0)
        } catch { if !Task.isCancelled { feed = nil; self.error = "Could not load radar. Check your connection." } }
    }
}
struct NativeRadar: UIViewRepresentable {
    let place: Place
    let template: String?
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
        if context.coordinator.template != template {
            context.coordinator.template = template; map.removeOverlays(map.overlays)
            if let template {
                let overlay = MKTileOverlay(urlTemplate: template); overlay.canReplaceMapContent = false; overlay.tileSize = CGSize(width: 512, height: 512); overlay.maximumZ = 12
                map.addOverlay(overlay, level: .aboveLabels)
            }
        }
    }
    final class Coordinator: NSObject, MKMapViewDelegate {
        var template: String?; var placeID: String?
        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let tile = overlay as? MKTileOverlay else { return MKOverlayRenderer(overlay: overlay) }
            let renderer = MKTileOverlayRenderer(tileOverlay: tile); renderer.alpha = 0.68; return renderer
        }
    }
}
