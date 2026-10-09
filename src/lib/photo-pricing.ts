// Single source of truth for photo/video pricing (client preview + server charge).
export type Tier = { min_qty: number; discount_percent?: number | null };
export type AlbumPricing = {
  photo_price: number; video_price: number; tiers: Tier[];
  pkg_all_photos: number | null; pkg_all_videos: number | null; pkg_all: number | null;
};
export type Package = "fotos" | "videos" | "tudo" | null;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function unitPrice(a: AlbumPricing, kind: "photo" | "video", qty: number) {
  let price = Number(kind === "photo" ? a.photo_price : a.video_price);
  const tiers = [...(a.tiers ?? [])].sort((x, y) => x.min_qty - y.min_qty);
  for (const t of tiers) {
    const p = kind === "photo" ? t.photo_price : t.video_price;
    if (qty >= t.min_qty && p != null && Number(p) > 0) price = Number(p);
  }
  return price;
}

/** Subtotal for a cart: package replaces the matching kind's per-item prices. */
export function cartTotal(a: AlbumPricing, photos: number, videos: number, pkg: Package) {
  if (pkg === "tudo" && a.pkg_all != null) return { subtotal: r2(Number(a.pkg_all)), photoUnit: 0, videoUnit: 0 };
  const photoUnit = unitPrice(a, "photo", photos);
  const videoUnit = unitPrice(a, "video", videos);
  const p = pkg === "fotos" && a.pkg_all_photos != null ? Number(a.pkg_all_photos) : photos * photoUnit;
  const v = pkg === "videos" && a.pkg_all_videos != null ? Number(a.pkg_all_videos) : videos * videoUnit;
  return { subtotal: r2(p + v), photoUnit, videoUnit };
}

/** Split: owner %, platform %, photographers % (proportional to item count per photographer). */
export function splitAmounts(total: number, pct: { owner: number; platform: number; photographer: number }, itemsByPhotographer: Record<string, number>) {
  const owner = r2((total * pct.owner) / 100);
  const photographers = r2((total * pct.photographer) / 100);
  const count = Object.values(itemsByPhotographer).reduce((a, b) => a + b, 0) || 1;
  const per: Record<string, number> = {};
  let acc = 0;
  const ids = Object.keys(itemsByPhotographer);
  ids.forEach((id, i) => {
    const v = i === ids.length - 1 ? r2(photographers - acc) : r2((photographers * itemsByPhotographer[id]!) / count);
    per[id] = v; acc = r2(acc + v);
  });
  return { owner, photographers, platform: r2(total - owner - photographers), per };
}
