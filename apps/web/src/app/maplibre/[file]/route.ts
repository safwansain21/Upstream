import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * MapLibre's web worker (it parses vector tiles and our GeoJSON). Bundled builds cannot locate it from import.meta.url,
 * so map-view.tsx calls setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"); the worker then imports the shared module
 * beside it. Only these two package files are served.
 */
const FILES = new Set(["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]);

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!FILES.has(file)) return new Response("Not found", { status: 404 });
  const body = await readFile(path.join(process.cwd(), "node_modules/maplibre-gl/dist", file));
  return new Response(body, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
