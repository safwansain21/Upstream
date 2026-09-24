import { getImageProps, type ImageLoader } from "next/image";

/** Pre-encoded AVIF + WebP variants in public/upstream-dark/scene (no runtime encoding, cacheable forever). */
export type SceneAsset = { name: string; width: number; height: number; widths: number[] };

export const PLATE: SceneAsset = { name: "plate", width: 1672, height: 941, widths: [640, 960, 1280, 1672] };
// Foliage crops, in plate pixels: branches (0,0)-(640,300); reeds (0,230)-(1220,941).
export const BRANCHES: SceneAsset = { name: "branches", width: 640, height: 300, widths: [320, 480, 640] };
export const REEDS: SceneAsset = { name: "reeds", width: 1220, height: 711, widths: [610, 915, 1220] };
export const NOTEBOOK: SceneAsset = { name: "notebook", width: 1536, height: 1024, widths: [384, 576, 768] };

const file = (asset: SceneAsset, format: "avif" | "webp"): ImageLoader => ({ width }) =>
  `/upstream-dark/scene/${asset.name}-${asset.widths.find(w => w >= width) ?? asset.widths.at(-1)}.${format}`;

/** next/image props for both formats; the browser takes AVIF and falls back to WebP. */
export function ScenePicture({ asset, sizes, className, eager = false }: { asset: SceneAsset; sizes: string; className?: string; eager?: boolean }) {
  const common = { src: `/upstream-dark/scene/${asset.name}`, alt: "", width: asset.width, height: asset.height, sizes };
  const avif = getImageProps({ ...common, loader: file(asset, "avif") }).props;
  const { props } = getImageProps({ ...common, loader: file(asset, "webp"), loading: eager ? "eager" : "lazy", fetchPriority: eager ? "high" : "auto" });
  return <picture><source type="image/avif" srcSet={avif.srcSet} sizes={sizes}/><img {...props} className={className} decoding="async"/></picture>;
}
