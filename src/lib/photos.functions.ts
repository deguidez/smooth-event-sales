import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { auditedAction } from "./activity-middleware";
import { asaasFetch, getAdmin, loadSettings } from "./asaas.server";
import { cartTotal, splitAmounts, type AlbumPricing } from "./photo-pricing";

const FACE_THRESHOLD = 0.5;
const uuid = z.string().uuid();
const vec = z.array(z.number().min(-2).max(2)).length(128);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function isAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  return !!data;
}
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  if (!(await isAdmin(ctx))) throw new Error("Acesso restrito ao super admin");
}
async function assertAcceptedPhotographer(userId: string, albumId: string) {
  const admin = await getAdmin();
  const { data: ph } = await admin.from("photographers").select("status").eq("user_id", userId).maybeSingle();
  if (ph?.status !== "aprovado") throw new Error("Seu cadastro de fotógrafo ainda não foi aprovado");
  const { data: m } = await admin.from("album_photographers").select("status").eq("album_id", albumId).eq("user_id", userId).maybeSingle();
  if (m?.status !== "aceito") throw new Error("Aceite o convite deste álbum antes de enviar arquivos");
}
type MRow = { storage?: string | null; kind: string; preview_path: string; original_path?: string };
async function signPreviews(rows: MRow[], seconds = 60 * 60) {
  const { signMany } = await import("./media-storage.server");
  return signMany(rows.map((r) => ({ storage: r.storage ?? "cloud", path: r.preview_path, kind: "preview" as const, isVideo: r.kind === "video" })), seconds);
}
const SIX_MONTHS = 183 * 86400_000;

/* ------------------------------ Fotógrafo ------------------------------ */

const bankSchema = z.object({
  bank_name: z.string().trim().max(80).default(""), agency: z.string().trim().max(10).default(""),
  account: z.string().trim().max(20).default(""), account_type: z.string().max(20).default("CONTA_CORRENTE"),
  pix_key: z.string().trim().max(120).default(""),
});

export const getPhotographerMe = createServerFn({ method: "GET" })
  .middleware([auditedAction("getPhotographerMe")])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: me } = await admin.from("photographers").select("*").eq("user_id", context.userId).maybeSingle();
    const { data: invites } = await admin.from("album_photographers").select("id, status, album_id, photo_albums(id, active, events(title, starts_at, city, state))").eq("user_id", context.userId).order("created_at", { ascending: false });
    return { me, invites: invites ?? [] };
  });

export const getPhotographerMenuAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const [{ data: ph }, { data: inv }] = await Promise.all([
      admin.from("photographers").select("id").eq("user_id", context.userId).limit(1),
      admin.from("album_photographers").select("id").eq("user_id", context.userId).limit(1),
    ]);
    return { allowed: !!ph?.length || !!inv?.length };
  });

export const savePhotographer = createServerFn({ method: "POST" })
  .middleware([auditedAction("savePhotographer")])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(3).max(120), document: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF/CNPJ inválido"),
    phone: z.string().trim().min(10).max(20), asaas_wallet_id: z.string().trim().uuid("Carteira Asaas (walletId) inválida"), bank: bankSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: ex } = await admin.from("photographers").select("status").eq("user_id", context.userId).maybeSingle();
    const row = { ...data, bank: data.bank as any };
    if (ex) await admin.from("photographers").update(row).eq("user_id", context.userId);
    else await admin.from("photographers").insert({ user_id: context.userId, ...row });
    return { ok: true };
  });

export const respondAlbumInvite = createServerFn({ method: "POST" })
  .middleware([auditedAction("respondAlbumInvite")])
  .inputValidator((d) => z.object({ id: uuid, accept: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: inv } = await admin.from("album_photographers").select("user_id").eq("id", data.id).maybeSingle();
    if (inv?.user_id !== context.userId) throw new Error("Convite não encontrado");
    await admin.from("album_photographers").update({ status: data.accept ? "aceito" : "recusado" }).eq("id", data.id);
    return { ok: true };
  });

export const getUploadTargets = createServerFn({ method: "POST" })
  .middleware([auditedAction("getUploadTargets")])
  .inputValidator((d) => z.object({ albumId: uuid, files: z.array(z.object({ kind: z.enum(["photo", "video"]), ext: z.string().regex(/^[a-z0-9]{2,5}$/) })).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAcceptedPhotographer(context.userId, data.albumId);
    const admin = await getAdmin();
    const { data: album } = await admin.from("photo_albums").select("watermark_photo_url, watermark_video_url").eq("id", data.albumId).single();
    const { vpsEnabled, uploadUrl } = await import("./media-storage.server");
    const storage = vpsEnabled() ? "vps" : "cloud";
    const targets = [];
    for (const f of data.files) {
      const id = crypto.randomUUID();
      const base = `${data.albumId}/${context.userId}/${id}`;
      const isVideo = f.kind === "video";
      const orig = await uploadUrl(storage, `${base}.${f.ext}`, "original", isVideo);
      const prev = isVideo ? null : await uploadUrl(storage, `${base}.jpg`, "preview", false);
      targets.push({ storage, original: orig, preview: prev });
    }
    return { targets, watermarkPhoto: album?.watermark_photo_url ?? null, watermarkVideo: album?.watermark_video_url ?? null };
  });

export const registerMedia = createServerFn({ method: "POST" })
  .middleware([auditedAction("registerMedia")])
  .inputValidator((d) => z.object({
    albumId: uuid,
    items: z.array(z.object({
      kind: z.enum(["photo", "video"]), storage: z.enum(["cloud", "vps"]).default("cloud"), original_path: z.string().max(300), preview_path: z.string().max(300).nullable(),
      width: z.number().int().nullable(), height: z.number().int().nullable(), faces: z.array(vec).max(60),
    })).min(1).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAcceptedPhotographer(context.userId, data.albumId);
    const prefix = `${data.albumId}/${context.userId}/`;
    const admin = await getAdmin();
    for (const it of data.items) {
      if (!it.original_path.startsWith(prefix) || (it.preview_path && !it.preview_path.startsWith(prefix))) throw new Error("Arquivo inválido");
      // Videos are previewed from the original with an overlay in the player.
      const preview = it.kind === "video" ? it.original_path : it.preview_path!;
      const { data: m, error } = await admin.from("media_items").insert({
        album_id: data.albumId, photographer_id: context.userId, kind: it.kind, storage: it.storage,
        original_path: it.original_path, preview_path: preview, width: it.width, height: it.height, faces: it.faces.length,
      }).select("id").single();
      if (error) throw new Error(error.message);
      if (it.faces.length) await admin.from("media_faces").insert(it.faces.map((f) => ({ media_id: m.id, album_id: data.albumId, embedding: JSON.stringify(f) as any })));
    }
    return { ok: true, count: data.items.length };
  });

export const myAlbumMedia = createServerFn({ method: "GET" })
  .middleware([auditedAction("myAlbumMedia")])
  .inputValidator((d) => z.object({ albumId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: rows } = await admin.from("media_items").select("id, kind, storage, preview_path, faces, created_at").eq("album_id", data.albumId).eq("photographer_id", context.userId).order("created_at", { ascending: false }).limit(300);
    const urls = await signPreviews((rows ?? []).filter((r) => r.kind === "photo"));
    const { count: total } = await admin.from("media_items").select("id", { count: "exact", head: true }).eq("album_id", data.albumId).eq("photographer_id", context.userId);
    return { total: total ?? 0, items: (rows ?? []).map((r) => ({ ...r, url: urls[r.preview_path] ?? null })) };
  });

export const deleteMyMedia = createServerFn({ method: "POST" })
  .middleware([auditedAction("deleteMyMedia")])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: m } = await admin.from("media_items").select("photographer_id, kind, storage, original_path, preview_path").eq("id", data.id).maybeSingle();
    if (!m) throw new Error("Arquivo não encontrado");
    if (m.photographer_id !== context.userId && !(await isAdmin(context))) throw new Error("Sem permissão");
    const { count } = await admin.from("photo_order_items").select("id", { count: "exact", head: true }).eq("media_id", data.id);
    if (count) throw new Error("Este arquivo já foi vendido e não pode ser removido");
    await admin.from("media_items").delete().eq("id", data.id);
    const { removeMedia } = await import("./media-storage.server");
    await removeMedia(m);
    return { ok: true };
  });

/* ------------------------------ Público ------------------------------ */

export const listPublicAlbums = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await getAdmin();
  const { data } = await admin.from("photo_albums").select("id, photo_price, video_price, pkg_all_photos, pkg_all, events(title, slug, starts_at, city, state, cover_url)").eq("active", true).order("created_at", { ascending: false }).limit(60);
  const out = [];
  for (const a of data ?? []) {
    const { count } = await admin.from("media_items").select("id", { count: "exact", head: true }).eq("album_id", a.id);
    out.push({ ...a, media_count: count ?? 0 });
  }
  return out;
});

const PRICING_COLS = "photo_price, video_price, tiers, pkg_all_photos, pkg_all_videos, pkg_all";

export const getPublicAlbum = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ albumId: uuid }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: a } = await admin.from("photo_albums").select(`id, active, watermark_video_url, ${PRICING_COLS}, events(id, title, starts_at, city, state, cover_url)`).eq("id", data.albumId).maybeSingle();
    if (!a?.active) throw new Error("Álbum não disponível");
    const [{ count: photos }, { count: videos }] = await Promise.all([
      admin.from("media_items").select("id", { count: "exact", head: true }).eq("album_id", a.id).eq("kind", "photo"),
      admin.from("media_items").select("id", { count: "exact", head: true }).eq("album_id", a.id).eq("kind", "video"),
    ]);
    return { album: a, photos: photos ?? 0, videos: videos ?? 0 };
  });

export const listAlbumMedia = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ albumId: uuid, ids: z.array(uuid).max(500).optional(), page: z.number().int().min(0).default(0), kind: z.enum(["photo", "video"]).optional() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: a } = await admin.from("photo_albums").select("active").eq("id", data.albumId).maybeSingle();
    if (!a?.active) throw new Error("Álbum não disponível");
    let q = admin.from("media_items").select("id, kind, storage, preview_path, width, height").eq("album_id", data.albumId).is("purged_at", null);
    if (data.ids) q = q.in("id", data.ids.length ? data.ids : ["00000000-0000-0000-0000-000000000000"]);
    if (data.kind) q = q.eq("kind", data.kind);
    const { data: rows } = await q.order("created_at").range(data.page * 60, data.page * 60 + 59);
    const urls = await signPreviews(rows ?? [], 60 * 60 * 2);
    return (rows ?? []).map((r) => ({ id: r.id, kind: r.kind, width: r.width, height: r.height, url: urls[r.preview_path] ?? null }));
  });

async function matchIds(albumId: string, embedding: number[]) {
  const admin = await getAdmin();
  const { data, error } = await (admin as any).rpc("match_faces", { _album_id: albumId, _embedding: JSON.stringify(embedding), _threshold: FACE_THRESHOLD, _limit: 500 });
  if (error) throw new Error("Não foi possível buscar as fotos");
  return (data ?? []) as { media_id: string; distance: number }[];
}

export const searchFaces = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ albumId: uuid, embedding: vec }).parse(d))
  .handler(async ({ data }) => {
    const matches = await matchIds(data.albumId, data.embedding);
    return matches.map((m) => m.media_id);
  });

/** Registra a busca do cliente logado para o e-mail "encontramos suas fotos". */
export const trackPhotoSearch = createServerFn({ method: "POST" })
  .middleware([auditedAction("trackPhotoSearch")])
  .inputValidator((d) => z.object({ albumId: uuid, matches: z.number().int().min(0).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!data.matches) return { ok: true };
    const email = (context as any).claims?.email as string | undefined;
    if (!email) return { ok: true };
    const admin = await getAdmin();
    await admin.from("photo_searches").upsert({ album_id: data.albumId, user_id: context.userId, email, matches: data.matches, created_at: new Date().toISOString(), reminded_at: null }, { onConflict: "album_id,user_id" });
    return { ok: true };
  });

/* ------------------------------ Compra ------------------------------ */

export const createPhotoOrder = createServerFn({ method: "POST" })
  .middleware([auditedAction("createPhotoOrder")])
  .inputValidator((d) => z.object({
    albumId: uuid, mediaIds: z.array(uuid).max(2000), package: z.enum(["fotos", "videos", "tudo"]).nullable(),
    embedding: vec.optional(), coupon: z.string().trim().max(40).optional(), method: z.enum(["PIX", "CREDIT_CARD"]),
    customer: z.object({ name: z.string().trim().min(3).max(120), email: z.string().trim().email(), cpf: z.string().regex(/^\d{11}$/, "CPF inválido"), phone: z.string().trim().max(20).optional() }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const s = await loadSettings();
    if (!s.asaas_api_key) throw new Error("Pagamentos ainda não configurados pela plataforma");
    const { data: a } = await admin.from("photo_albums").select(`*, events(id, title, producer_id, producers(asaas_wallet_id, status))`).eq("id", data.albumId).single();
    if (!a?.active) throw new Error("Álbum não disponível");

    // Package = everything where the customer was found by the selfie (re-matched server-side).
    let ids = [...new Set(data.mediaIds)];
    if (data.package) {
      if (!data.embedding) throw new Error("Faça a busca por selfie para comprar o pacote");
      const matched = (await matchIds(a.id, data.embedding)).map((m) => m.media_id);
      ids = [...new Set([...ids, ...matched])];
    }
    if (!ids.length) throw new Error("Selecione ao menos uma foto ou vídeo");
    const { data: media } = await admin.from("media_items").select("id, kind, photographer_id").eq("album_id", a.id).in("id", ids);
    const items = media ?? [];
    if (!items.length) throw new Error("Itens não encontrados");
    const photos = items.filter((m) => m.kind === "photo");
    const videos = items.filter((m) => m.kind === "video");
    const pkg = data.package;
    const { subtotal, photoUnit, videoUnit } = cartTotal(a as unknown as AlbumPricing, photos.length, videos.length, pkg);

    let discount = 0;
    let couponCode: string | null = null;
    if (data.coupon) {
      const { evaluateCoupon } = await import("./coupons.server");
      const c = await evaluateCoupon(data.coupon, a.event_id, subtotal);
      discount = c.discount; couponCode = c.code;
    }
    const total = r2(subtotal - discount);
    if (total < 5) throw new Error("O valor mínimo para pagamento é R$ 5,00");

    const byPh: Record<string, number> = {};
    for (const m of items) byPh[m.photographer_id] = (byPh[m.photographer_id] ?? 0) + 1;
    const sp = splitAmounts(total, { owner: Number(a.owner_percent), platform: Number(a.platform_percent), photographer: Number(a.photographer_percent) }, byPh);
    const { data: phs } = await admin.from("photographers").select("user_id, asaas_wallet_id, status").in("user_id", Object.keys(byPh));
    const ownerWallet = (a as any).events?.producers?.asaas_wallet_id as string | null;
    const split: { type: string; id: string; walletId: string; amount: number }[] = [];
    if (sp.owner > 0) {
      if (!ownerWallet) throw new Error("O organizador deste evento ainda não está habilitado para receber");
      split.push({ type: "owner", id: (a as any).events.producer_id, walletId: ownerWallet, amount: sp.owner });
    }
    for (const [uid, amount] of Object.entries(sp.per)) {
      const w = phs?.find((p) => p.user_id === uid)?.asaas_wallet_id;
      if (!w) throw new Error("Um dos fotógrafos ainda não está habilitado para receber");
      if (amount > 0) split.push({ type: "photographer", id: uid, walletId: w, amount });
    }

    const { data: order, error } = await admin.from("photo_orders").insert({
      album_id: a.id, user_id: context.userId, customer_name: data.customer.name, customer_email: data.customer.email,
      customer_cpf: data.customer.cpf, customer_phone: data.customer.phone ?? null, package: pkg, subtotal, discount,
      coupon_code: couponCode, total, owner_amount: sp.owner, platform_amount: sp.platform, photographers_amount: sp.photographers,
      split: split as any, payment_method: data.method,
    }).select("id, code").single();
    if (error) throw new Error(error.message);
    const unitFor = (k: string) => (k === "photo" ? (pkg === "fotos" || pkg === "tudo" ? 0 : photoUnit) : (pkg === "videos" || pkg === "tudo" ? 0 : videoUnit));
    await admin.from("photo_order_items").insert(items.map((m) => ({ order_id: order.id, media_id: m.id, photographer_id: m.photographer_id, kind: m.kind, price: unitFor(m.kind) })));

    try {
      const customer = await asaasFetch<{ id: string }>(s, "/customers", { method: "POST", body: { name: data.customer.name, cpfCnpj: data.customer.cpf, email: data.customer.email, mobilePhone: data.customer.phone?.replace(/\D/g, "") || undefined, externalReference: context.userId, notificationDisabled: true } });
      const due = new Date(); due.setDate(due.getDate() + 1);
      let ip: string | undefined;
      try { ip = getRequest().headers.get("cf-connecting-ip") ?? undefined; } catch {}
      const payment = await asaasFetch<any>(s, "/payments", { method: "POST", body: {
        customer: customer.id, billingType: data.method, dueDate: due.toISOString().slice(0, 10), value: total,
        description: `Fotos - ${(a as any).events.title} (#${order.code})`, externalReference: `photo_${order.id}`,
        split: split.map((x) => ({ walletId: x.walletId, fixedValue: x.amount })), remoteIp: ip,
      } });
      const patch: any = { asaas_payment_id: payment.id, invoice_url: payment.invoiceUrl };
      if (data.method === "PIX") {
        const qr = await asaasFetch<{ encodedImage: string; payload: string }>(s, `/payments/${payment.id}/pixQrCode`);
        patch.pix_qr_image = qr.encodedImage; patch.pix_payload = qr.payload;
      }
      await admin.from("photo_orders").update(patch).eq("id", order.id);
      const { notifyPhotoOrder } = await import("./photo-notify.server");
      await notifyPhotoOrder(order.id, "fotos_pedido_criado");
    } catch (e) {
      await admin.from("photo_orders").update({ status: "cancelado" }).eq("id", order.id);
      throw new Error("Não foi possível gerar a cobrança: " + (e as Error).message);
    }
    return { orderId: order.id };
  });

/** Applies an Asaas status to a photo order (webhook + manual refresh). */
export async function applyPhotoOrderStatus(orderId: string, status: string) {
  const admin = await getAdmin();
  const { data: o } = await admin.from("photo_orders").select("status").eq("id", orderId).maybeSingle();
  if (!o || o.status === status || (o.status === "pago" && status === "vencido")) return;
  const now = Date.now();
  await admin.from("photo_orders").update({ status, ...(status === "pago" ? { paid_at: new Date(now).toISOString(), expires_at: new Date(now + SIX_MONTHS).toISOString() } : {}) }).eq("id", orderId);
  if (status === "pago") {
    const { notifyPhotoOrder } = await import("./photo-notify.server");
    await notifyPhotoOrder(orderId, "fotos_pagas");
  }
}

export const refreshPhotoOrder = createServerFn({ method: "POST" })
  .middleware([auditedAction("refreshPhotoOrder")])
  .inputValidator((d) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: o } = await context.supabase.from("photo_orders").select("id, status, asaas_payment_id").eq("id", data.orderId).maybeSingle();
    if (!o) throw new Error("Pedido não encontrado");
    if (o.status !== "pendente" || !o.asaas_payment_id) return { status: o.status };
    const { mapAsaasStatus } = await import("./asaas.server");
    const p = await asaasFetch<any>(await loadSettings(), `/payments/${o.asaas_payment_id}`);
    const st = mapAsaasStatus(p.status);
    await applyPhotoOrderStatus(o.id, st);
    return { status: st };
  });

export const myPhotoOrders = createServerFn({ method: "GET" })
  .middleware([auditedAction("myPhotoOrders")])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("photo_orders").select("id, code, status, total, package, payment_method, invoice_url, pix_qr_image, pix_payload, created_at, paid_at, expires_at, photo_albums(events(title, starts_at))").eq("user_id", context.userId).order("created_at", { ascending: false });
    return data ?? [];
  });

async function signOriginals(items: { kind: string; path: string; storage?: string | null }[]) {
  const { signMany } = await import("./media-storage.server");
  return signMany(items.map((i) => ({ storage: i.storage ?? "cloud", path: i.path, kind: "original" as const, isVideo: i.kind === "video" })), 60 * 60 * 24, true);
}

/** Signed original links — only for paid orders of the caller (or super admin). */
export const photoOrderDownloads = createServerFn({ method: "POST" })
  .middleware([auditedAction("photoOrderDownloads")])
  .inputValidator((d) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: o } = await context.supabase.from("photo_orders").select("id, status, expires_at").eq("id", data.orderId).maybeSingle();
    if (!o) throw new Error("Pedido não encontrado");
    if (o.status !== "pago") throw new Error("Pagamento ainda não confirmado");
    if (o.expires_at && new Date(o.expires_at).getTime() < Date.now()) throw new Error("O prazo de 6 meses para baixar estas fotos terminou");
    const admin = await getAdmin();
    const { data: items } = await admin.from("photo_order_items").select("media_id, kind, media_items(storage, original_path, preview_path)").eq("order_id", o.id);
    const previews = await signPreviews((items ?? []).filter((i: any) => i.kind === "photo").map((i: any) => ({ ...i.media_items, kind: i.kind })));
    const urls = await signOriginals((items ?? []).map((i: any) => ({ kind: i.kind, path: i.media_items.original_path, storage: i.media_items.storage })));
    return (items ?? []).map((i: any) => ({ id: i.media_id, kind: i.kind, download: urls[i.media_items.original_path] ?? null, thumb: previews[i.media_items.preview_path] ?? null }));
  });

/* ------------------------------ Super admin ------------------------------ */

export const adminPhotoOverview = createServerFn({ method: "GET" })
  .middleware([auditedAction("adminPhotoOverview")])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();
    const [{ data: albums }, { data: photographers }, { data: events }] = await Promise.all([
      admin.from("photo_albums").select("*, events(title, starts_at, city, state, producers(company_name))").order("created_at", { ascending: false }),
      admin.from("photographers").select("*").order("created_at", { ascending: false }),
      admin.from("events").select("id, title, starts_at").order("starts_at", { ascending: false }).limit(300),
    ]);
    return { albums: albums ?? [], photographers: photographers ?? [], events: events ?? [] };
  });

export const setPhotographerStatus = createServerFn({ method: "POST" })
  .middleware([auditedAction("setPhotographerStatus")])
  .inputValidator((d) => z.object({ userId: uuid, status: z.enum(["pendente", "aprovado", "suspenso"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await (await getAdmin()).from("photographers").update({ status: data.status }).eq("user_id", data.userId);
    return { ok: true };
  });

const tierSchema = z.object({ min_qty: z.number().int().min(2), photo_price: z.number().min(0).nullable(), video_price: z.number().min(0).nullable() });
const money = z.number().min(0).max(100000);

export const saveAlbum = createServerFn({ method: "POST" })
  .middleware([auditedAction("saveAlbum")])
  .inputValidator((d) => z.object({
    id: uuid.optional(), event_id: uuid, active: z.boolean(),
    owner_percent: z.number().min(0).max(100), platform_percent: z.number().min(0).max(100), photographer_percent: z.number().min(0).max(100),
    photo_price: money, video_price: money, tiers: z.array(tierSchema).max(10),
    pkg_all_photos: money.nullable(), pkg_all_videos: money.nullable(), pkg_all: money.nullable(),
    watermark_photo_url: z.string().max(1_500_000).regex(/^data:image\/png;base64,/).nullable(),
    watermark_video_url: z.string().max(1_500_000).regex(/^data:image\/png;base64,/).nullable(),
    owner_sees_total: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (Math.abs(data.owner_percent + data.platform_percent + data.photographer_percent - 100) > 0.001) throw new Error("As comissões precisam somar 100%");
    const admin = await getAdmin();
    const { id, ...row } = data;
    const q = id ? admin.from("photo_albums").update(row as any).eq("id", id) : admin.from("photo_albums").insert(row as any);
    const { error } = await q;
    if (error) throw new Error(error.code === "23505" ? "Este evento já tem um álbum de fotos" : error.message);
    return { ok: true };
  });

export const inviteAlbumPhotographer = createServerFn({ method: "POST" })
  .middleware([auditedAction("inviteAlbumPhotographer")])
  .inputValidator((d) => z.object({ albumId: uuid, userId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();
    const { data: ph } = await admin.from("photographers").select("status").eq("user_id", data.userId).maybeSingle();
    if (ph?.status !== "aprovado") throw new Error("Aprove o fotógrafo antes de convidar");
    const { error } = await admin.from("album_photographers").upsert({ album_id: data.albumId, user_id: data.userId, status: "convidado" }, { onConflict: "album_id,user_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeAlbumPhotographer = createServerFn({ method: "POST" })
  .middleware([auditedAction("removeAlbumPhotographer")])
  .inputValidator((d) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await (await getAdmin()).from("album_photographers").delete().eq("id", data.id);
    return { ok: true };
  });

async function albumStats(albumId: string) {
  const admin = await getAdmin();
  const { data: orders } = await admin.from("photo_orders").select("id, code, total, owner_amount, platform_amount, photographers_amount, split, status, customer_name, customer_email, customer_cpf, customer_phone, package, payment_method, created_at, paid_at").eq("album_id", albumId).order("created_at", { ascending: false });
  const paid = (orders ?? []).filter((o) => o.status === "pago");
  const paidIds = paid.map((o) => o.id);
  const { data: items } = paidIds.length ? await admin.from("photo_order_items").select("order_id, kind, photographer_id").in("order_id", paidIds) : { data: [] as any[] };
  const { data: media } = await admin.from("media_items").select("kind, photographer_id").eq("album_id", albumId);
  const sum = (k: "total" | "owner_amount" | "platform_amount" | "photographers_amount") => r2(paid.reduce((a, o) => a + Number(o[k]), 0));
  const phEarn: Record<string, number> = {};
  for (const o of paid) for (const s of (o.split as any[]) ?? []) if (s.type === "photographer") phEarn[s.id] = r2((phEarn[s.id] ?? 0) + Number(s.amount));
  const ids = new Set<string>([...(media ?? []).map((m) => m.photographer_id), ...Object.keys(phEarn)]);
  const ranking = [...ids].map((id) => ({
    id,
    photosSent: (media ?? []).filter((m) => m.photographer_id === id && m.kind === "photo").length,
    videosSent: (media ?? []).filter((m) => m.photographer_id === id && m.kind === "video").length,
    photosSold: (items ?? []).filter((i) => i.photographer_id === id && i.kind === "photo").length,
    videosSold: (items ?? []).filter((i) => i.photographer_id === id && i.kind === "video").length,
    earnings: phEarn[id] ?? 0,
  })).sort((a, b) => b.earnings - a.earnings || b.photosSold - a.photosSold);
  const photosSold = (items ?? []).filter((i) => i.kind === "photo").length;
  const videosSold = (items ?? []).filter((i) => i.kind === "video").length;
  return {
    orders: orders ?? [], paidCount: paid.length, total: sum("total"), owner: sum("owner_amount"), platform: sum("platform_amount"), photographers: sum("photographers_amount"),
    ticket: paid.length ? r2(sum("total") / paid.length) : 0, photosSold, videosSold,
    photosPerOrder: paid.length ? r2(photosSold / paid.length) : 0, videosPerOrder: paid.length ? r2(videosSold / paid.length) : 0,
    totalPhotos: (media ?? []).filter((m) => m.kind === "photo").length, totalVideos: (media ?? []).filter((m) => m.kind === "video").length,
    ranking,
  };
}

export const adminAlbumDashboard = createServerFn({ method: "GET" })
  .middleware([auditedAction("adminAlbumDashboard")])
  .inputValidator((d) => z.object({ albumId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();
    const stats = await albumStats(data.albumId);
    const { data: members } = await admin.from("album_photographers").select("id, user_id, status").eq("album_id", data.albumId);
    const { data: phs } = await admin.from("photographers").select("user_id, name, phone, status");
    return { ...stats, members: members ?? [], phList: phs ?? [] };
  });

export const adminPhotoOrderDownloads = createServerFn({ method: "POST" })
  .middleware([auditedAction("adminPhotoOrderDownloads")])
  .inputValidator((d) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();
    const { data: items } = await admin.from("photo_order_items").select("media_id, kind, media_items(storage, original_path)").eq("order_id", data.orderId);
    const urls = await signOriginals((items ?? []).map((i: any) => ({ kind: i.kind, path: i.media_items.original_path, storage: i.media_items.storage })));
    return (items ?? []).map((i: any) => ({ id: i.media_id, kind: i.kind, url: urls[i.media_items.original_path] ?? null }));
  });

/* ------------------------------ Ganhos (fotógrafo / organizador) ------------------------------ */

export const photographerEarnings = createServerFn({ method: "GET" })
  .middleware([auditedAction("photographerEarnings")])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: albums } = await admin.from("album_photographers").select("album_id, photo_albums(events(title))").eq("user_id", context.userId).eq("status", "aceito");
    const rows = [];
    for (const a of albums ?? []) {
      const { data: orders } = await admin.from("photo_orders").select("id, split").eq("album_id", a.album_id).eq("status", "pago");
      let earnings = 0;
      for (const o of orders ?? []) for (const s of (o.split as any[]) ?? []) if (s.type === "photographer" && s.id === context.userId) earnings += Number(s.amount);
      const ids = (orders ?? []).map((o) => o.id);
      const { data: items } = ids.length ? await admin.from("photo_order_items").select("kind").in("order_id", ids).eq("photographer_id", context.userId) : { data: [] as any[] };
      rows.push({ albumId: a.album_id, title: (a as any).photo_albums?.events?.title ?? "", earnings: r2(earnings), photosSold: (items ?? []).filter((i) => i.kind === "photo").length, videosSold: (items ?? []).filter((i) => i.kind === "video").length });
    }
    return rows;
  });

export const ownerPhotoEarnings = createServerFn({ method: "GET" })
  .middleware([auditedAction("ownerPhotoEarnings")])
  .handler(async ({ context }) => {
    const { data: pid } = await context.supabase.rpc("my_producer_id");
    if (!pid) return [];
    const admin = await getAdmin();
    const { data: albums } = await admin.from("photo_albums").select("id, owner_sees_total, events!inner(title, producer_id)").eq("events.producer_id", pid);
    const rows = [];
    for (const a of albums ?? []) {
      const { data: orders } = await admin.from("photo_orders").select("total, owner_amount").eq("album_id", a.id).eq("status", "pago");
      const owner = r2((orders ?? []).reduce((s, o) => s + Number(o.owner_amount), 0));
      const total = r2((orders ?? []).reduce((s, o) => s + Number(o.total), 0));
      rows.push({ albumId: a.id, title: (a as any).events.title, owner, orders: (orders ?? []).length, total: a.owner_sees_total ? total : null });
    }
    return rows;
  });
