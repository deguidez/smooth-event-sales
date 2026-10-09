// Armazenamento de fotos/vídeos: nuvem (padrão) ou VPS (MinIO compatível com S3).
// A escolha e o endereço/bucket ficam em platform_settings (Super admin → Fotos);
// as chaves de acesso da VPS continuam em segredos do servidor (env).
// Arquivos antigos continuam onde estão: coluna media_items.storage.
import { AwsClient } from "aws4fetch";

export type Kind = "original" | "preview";

type VpsCfg = { endpoint: string; bucket: string; client: AwsClient };

async function cfg(): Promise<VpsCfg | null> {
  const accessKeyId = process.env["VPS_S3_ACCESS_KEY"];
  const secretAccessKey = process.env["VPS_S3_SECRET_KEY"];
  let endpoint = process.env["VPS_S3_ENDPOINT"]?.replace(/\/+$/, "") ?? null;
  let bucket = process.env["VPS_S3_BUCKET"] || "evenon-fotos";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("platform_settings")
      .select("media_storage, media_vps_endpoint, media_vps_bucket")
      .eq("id", 1)
      .maybeSingle();
    if (s) {
      if (s.media_storage !== "vps") return null; // nuvem é o padrão e a escolha atual
      endpoint = s.media_vps_endpoint?.replace(/\/+$/, "") || endpoint;
      bucket = s.media_vps_bucket || bucket;
    }
  } catch {
    // sem acesso às configurações, cai no comportamento por env
  }
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: process.env["VPS_S3_REGION"] || "us-east-1" }) };
}

export const vpsEnabled = async () => !!(await cfg());

/** Diagnóstico (somente admin): testa listagem do bucket na VPS. */
export async function vpsCheck() {
  const c = await cfg();
  if (!c) return { enabled: false as const };
  try {
    const res = await c.client.fetch(`${c.endpoint}/${c.bucket}?list-type=2&max-keys=1`, { method: "GET" });
    const body = await res.text();
    if (!res.ok) return { enabled: true as const, ok: false as const, status: res.status, error: body.slice(0, 300) };
    return { enabled: true as const, ok: true as const, bucket: c.bucket };
  } catch (e) {
    return { enabled: true as const, ok: false as const, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

const cloudBucket = (kind: Kind, isVideo: boolean) => (kind === "preview" || isVideo ? "media-previews" : "media-originals");
/** Organização na VPS: <album>/originais|previas/<fotografo>/<arquivo> */
export const vpsKey = (path: string, kind: Kind, isVideo: boolean) => {
  const [album, ...rest] = path.split("/");
  return `${album}/${kind === "original" || isVideo ? "originais" : "previas"}/${rest.join("/")}`;
};

async function presign(method: "GET" | "PUT" | "DELETE", key: string, seconds: number, download?: boolean) {
  const c = (await cfg())!;
  const url = new URL(`${c.endpoint}/${c.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  url.searchParams.set("X-Amz-Expires", String(seconds));
  if (download) url.searchParams.set("response-content-disposition", `attachment; filename="${key.split("/").pop()}"`);
  const signed = await c.client.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

export async function uploadUrl(storage: string, path: string, kind: Kind, isVideo: boolean) {
  if (storage === "vps") return { url: await presign("PUT", vpsKey(path, kind, isVideo), 60 * 60), path, token: null as string | null };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bucket = cloudBucket(kind, isVideo);
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error("Não foi possível preparar o envio");
  return { url: null as string | null, path: data.path, token: data.token, bucket };
}

export async function signMany(items: { storage: string; path: string; kind: Kind; isVideo: boolean }[], seconds: number, download = false) {
  const out: Record<string, string> = {};
  const vps = items.filter((i) => i.storage === "vps");
  await Promise.all(vps.map(async (i) => { out[i.path] = await presign("GET", vpsKey(i.path, i.kind, i.isVideo), seconds, download); }));
  const cloud = items.filter((i) => i.storage !== "vps");
  if (cloud.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const groups: Record<string, string[]> = {};
    for (const i of cloud) (groups[cloudBucket(i.kind, i.isVideo)] ??= []).push(i.path);
    for (const [bucket, paths] of Object.entries(groups)) {
      for (let k = 0; k < paths.length; k += 500) {
        const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrls(paths.slice(k, k + 500), seconds, download ? { download: true } : undefined);
        for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      }
    }
  }
  return out;
}

export async function removeMedia(m: { storage: string; kind: string; original_path: string; preview_path: string }) {
  const isVideo = m.kind === "video";
  if (m.storage === "vps") {
    const keys = new Set([vpsKey(m.original_path, "original", isVideo), vpsKey(m.preview_path, "preview", isVideo)]);
    await Promise.all([...keys].map(async (k) => fetch(await presign("DELETE", k, 300), { method: "DELETE" }).catch(() => null)));
    return;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage.from("media-originals").remove([m.original_path]);
  await supabaseAdmin.storage.from("media-previews").remove([...new Set([m.preview_path, m.original_path])]);
}

/** Teste de conexão para o super admin. */
export async function testVps() {
  if (!(await cfg())) return { ok: false, message: "Dados da VPS ainda não cadastrados" };
  const key = `_teste/${crypto.randomUUID()}.txt`;
  const put = await fetch(await presign("PUT", key, 300), { method: "PUT", body: "ok" }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }) as any);
  if (!put.ok) return { ok: false, message: `Falha ao gravar na VPS (${put.status} ${put.statusText})` };
  await fetch(await presign("DELETE", key, 300), { method: "DELETE" }).catch(() => null);
  return { ok: true, message: "Conexão com a VPS funcionando" };
}
