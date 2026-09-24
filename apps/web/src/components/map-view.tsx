"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

export type MapPoint = { id: string; lon: number; lat: number; radiusM?: number | null; label: string; selected?: boolean };
type Props = { label: string; points?: MapPoint[]; pin?: { lon: number; lat: number } | null; onPick?: (lon: number, lat: number) => void;
  onSelect?: (id: string) => void; height?: number; onMapReady?: (map: any) => void };

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";
// Default (.env.example): OpenFreeMap, keyless; its tile source carries the OpenFreeMap/OpenMapTiles/OpenStreetMap attribution.
// Empty: our own data on a plain background.
const BLANK = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#0B1D21" } }] };

function circle(lon: number, lat: number, radiusM: number) { // polygon approximating a GPS accuracy radius
  const ring = Array.from({ length: 33 }, (_, i) => {
    const a = (i / 32) * 2 * Math.PI;
    return [lon + (radiusM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (radiusM / 110540) * Math.sin(a)];
  });
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function MapView({ label, points = [], pin, onPick, onSelect, height = 360, onMapReady }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const [failed, setFailed] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("maplibre-gl").then(({ Map, AttributionControl, NavigationControl, ScaleControl, setWorkerUrl }) => {
      if (cancelled || !box.current) return;
      setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"); // bundled builds cannot find the worker on their own (see app/maplibre)
      try {
        const m = new Map({ container: box.current, style: (STYLE_URL || BLANK) as any, center: [points[0]?.lon ?? pin?.lon ?? 0, points[0]?.lat ?? pin?.lat ?? 20],
          zoom: points.length || pin ? 12 : 1, attributionControl: false });
        m.addControl(new AttributionControl({ compact: false, customAttribution: STYLE_URL ? "" : "Upstream records · no basemap configured" }));
        m.addControl(new NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-left");
        // ponytail: every map resource here is the basemap (our data is inline GeoJSON), so any map error means the basemap failed
        m.on("error", () => setFailed("The background map is unavailable, so the map may be blank or incomplete. Use the list or coordinate fields, which hold the same information."));
        m.once("style.load", () => { // our records need only the style, not every basemap tile
          m.addSource("accuracy", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addSource("points", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addSource("pin", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "accuracy", type: "fill", source: "accuracy", paint: { "fill-color": "#72ADB8", "fill-opacity": 0.16 } });
          m.addLayer({ id: "points-halo", type: "circle", source: "points", paint: { "circle-radius": ["case", ["get", "selected"], 16, 10], "circle-color": ["case", ["get", "selected"], "#EEAF63", "#F4F0E8"], "circle-opacity": 0.18, "circle-blur": 0.6 } });
          m.addLayer({ id: "points", type: "circle", source: "points", paint: { "circle-radius": ["case", ["get", "selected"], 8, 5.5],
            "circle-color": ["case", ["get", "selected"], "#EEAF63", "#F4F0E8"], "circle-stroke-color": "#071113", "circle-stroke-width": 2 } });
          m.addLayer({ id: "pin", type: "circle", source: "pin", paint: { "circle-radius": 8, "circle-color": "#EEAF63", "circle-stroke-color": "#FFF3D9", "circle-stroke-width": 2 } });
          setReady(true); onMapReady?.(m);
        });
        if (onPick) m.on("click", (e: any) => onPick(Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))));
        if (onSelect) m.on("click", "points", (e: any) => onSelect(e.features[0].properties.id));
        map.current = m;
      } catch { setFailed("The interactive map could not start in this browser. Use the list or coordinate fields."); }
    }).catch(() => setFailed("The interactive map could not load. Use the list or coordinate fields."));
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { // data updates never move the camera (M-09); only explicit fit below on first data
    const m = map.current; if (!m || !ready) return;
    m.getSource("points")?.setData({ type: "FeatureCollection", features: points.map(p => ({ type: "Feature", properties: { id: p.id, selected: !!p.selected }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) });
    m.getSource("accuracy")?.setData({ type: "FeatureCollection", features: points.filter(p => p.radiusM).map(p => circle(p.lon, p.lat, Number(p.radiusM))) });
    m.getSource("pin")?.setData({ type: "FeatureCollection", features: pin ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [pin.lon, pin.lat] } }] : [] });
  }, [points, pin, ready]);

  useEffect(() => {
    const m = map.current; if (!m || !ready || !points.length) return;
    const lons = points.map(p => p.lon), lats = points.map(p => p.lat);
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 14, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return <figure className="atlas-map-frame" style={{ margin: 0 }}>
    <div ref={box} role="application" aria-label={`${label}. A list with the same information is provided.`} style={{ height, width: "100%" }} data-map-ready={ready ? "true" : "false"}/>
    <figcaption className="muted">{failed || (STYLE_URL ? label : `${label}. No background map is configured; positions are shown on a plain background.`)}</figcaption>
  </figure>;
}
