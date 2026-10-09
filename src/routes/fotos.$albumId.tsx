import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, Film, Loader2, ScanFace, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate } from "@/lib/format";
import { loadImage, scaled, selfieDescriptor } from "@/lib/face";
import { cartTotal, type AlbumPricing, type Package } from "@/lib/photo-pricing";
import { createPhotoOrder, getPublicAlbum, listAlbumMedia, searchFaces, trackPhotoSearch } from "@/lib/photos.functions";

export const Route = createFileRoute("/fotos/$albumId")({
  head: () => ({ meta: [
    { title: "Encontre suas fotos — Evenon" }, { name: "description", content: "Tire uma selfie e encontre suas fotos e vídeos do evento." },
    { property: "og:title", content: "Encontre suas fotos — Evenon" }, { property: "og:description", content: "Tire uma selfie e encontre suas fotos e vídeos do evento." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AlbumPage,
});

function AlbumPage() {
  const { albumId } = Route.useParams();
  const getAlbum = useServerFn(getPublicAlbum);
  const listMedia = useServerFn(listAlbumMedia);
  const search = useServerFn(searchFaces);
  const track = useServerFn(trackPhotoSearch);
  const { user: me } = useAuth();
  const { data, error } = useQuery({ queryKey: ["album", albumId], queryFn: () => getAlbum({ data: { albumId } }) });
  const [matched, setMatched] = useState<string[] | null>(null);
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [page, setPage] = useState(0);
  const [media, setMedia] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    listMedia({ data: { albumId, page, ...(matched ? { ids: matched.slice(page * 60, page * 60 + 60) } : {}) } })
      .then((rows) => alive && setMedia((m) => (page === 0 ? rows : [...m, ...rows])))
      .catch(() => {});
    return () => { alive = false; };
  }, [albumId, page, matched]);

  async function onSelfie(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const img = await loadImage(file);
      const d = await selfieDescriptor(scaled(img, 1024));
      if (!d) { toast.error("Não encontramos um rosto na foto. Tente com o rosto bem iluminado e de frente."); return; }
      const ids = await search({ data: { albumId, embedding: d } });
      if (me && ids.length) track({ data: { albumId, matches: ids.length } }).catch(() => {});
      setEmbedding(d); setMatched(ids); setPage(0); setMedia([]);
      toast.success(ids.length ? `Encontramos ${ids.length} arquivos com você!` : "Nenhuma foto encontrada com esse rosto.");
    } catch { toast.error("Não foi possível analisar a selfie"); }
    finally { setBusy(false); }
  }

  if (error) return <div className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">Álbum não disponível.</div>;
  if (!data) return <div className="mx-auto max-w-xl px-4 py-20 text-center text-muted-foreground">Carregando...</div>;
  const a = data.album as any;
  const total = matched ? matched.length : data.photos + data.videos;
  const toggle = (id: string) => setCart((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link to="/fotos" className="text-sm text-muted-foreground">← Todos os álbuns</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">{a.events.title}</h1>
          <p className="text-muted-foreground">{fmtDate(a.events.starts_at)} · {a.events.city}/{a.events.state} · {data.photos} fotos · {data.videos} vídeos</p>
        </div>
        <Button variant="hero" onClick={() => setOpen(true)}><ShoppingCart /> Carrinho ({cart.size})</Button>
      </div>

      <div className="mt-6 grid gap-4 rounded-2xl border bg-card p-5 shadow-card sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="flex items-center gap-2 text-lg font-bold"><ScanFace className="text-primary" /> Encontre suas fotos com uma selfie</p>
          <p className="text-sm text-muted-foreground">A foto é analisada no seu aparelho e não fica salva.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {busy ? "Procurando..." : "Tirar selfie"}
            <input type="file" accept="image/*" capture="user" className="hidden" disabled={busy} onChange={(e) => onSelfie(e.target.files?.[0])} />
          </label>
          {matched && <Button variant="outline" onClick={() => { setMatched(null); setEmbedding(null); setPage(0); setMedia([]); }}>Ver todas</Button>}
        </div>
      </div>

      {matched && <p className="mt-4 font-semibold">{matched.length} arquivos encontrados com você</p>}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {media.map((m) => (
          <div key={m.id} className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-muted ring-offset-2 ${cart.has(m.id) ? "ring-4 ring-primary" : ""}`} onClick={() => setView(m)}>
            {m.kind === "photo" ? <img src={m.url} alt="" loading="lazy" className="size-full object-cover" onContextMenu={(e) => e.preventDefault()} /> : <div className="flex size-full items-center justify-center"><Film className="size-8 text-muted-foreground" /></div>}
            <button onClick={(e) => { e.stopPropagation(); toggle(m.id); }} className={`absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full border-2 ${cart.has(m.id) ? "border-primary bg-primary text-primary-foreground" : "border-background bg-background/70"}`} aria-label="Selecionar"><Check className="size-4" /></button>
          </div>
        ))}
      </div>
      {media.length < total && media.length >= (page + 1) * 60 && <div className="mt-6 text-center"><Button variant="outline" onClick={() => setPage(page + 1)}>Carregar mais</Button></div>}

      {view && <Viewer m={view} wm={a.watermark_video_url} selected={cart.has(view.id)} onToggle={() => toggle(view.id)} onClose={() => setView(null)} />}
      <Cart open={open} onOpenChange={setOpen} album={a} albumId={albumId} cart={cart} media={media} embedding={embedding} matchedCount={matched?.length ?? 0} />
    </div>
  );
}

function Viewer({ m, wm, selected, onToggle, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4" onClick={onClose}>
      <div className="relative max-h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        {m.kind === "photo" ? <img src={m.url} alt="" className="max-h-[80vh] rounded-lg" onContextMenu={(e) => e.preventDefault()} /> : (
          <div className="relative">
            <video src={m.url} className="max-h-[80vh] rounded-lg" controls controlsList="nodownload noplaybackrate" disablePictureInPicture onContextMenu={(e) => e.preventDefault()}
              onTimeUpdate={(e) => { if (e.currentTarget.currentTime > 15) { e.currentTarget.pause(); e.currentTarget.currentTime = 0; } }} />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {wm ? <img src={wm} alt="" className="w-1/2 opacity-50" /> : <span className="text-5xl font-extrabold text-background/50">PRÉVIA</span>}
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-center gap-2">
          <Button variant={selected ? "outline" : "hero"} onClick={onToggle}>{selected ? "Remover do carrinho" : "Adicionar ao carrinho"}</Button>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
        {m.kind === "video" && <p className="mt-2 text-center text-xs text-background">Prévia de 15 segundos. O vídeo completo sem marca d'água é liberado após o pagamento.</p>}
      </div>
    </div>
  );
}

function Cart({ open, onOpenChange, album, albumId, cart, media, embedding, matchedCount }: any) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const create = useServerFn(createPhotoOrder);
  const [pkg, setPkg] = useState<Package>(null);
  const [coupon, setCoupon] = useState("");
  const [method, setMethod] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [c, setC] = useState({ name: "", email: "", cpf: "", phone: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!user || !open) return;
    supabase.from("profiles").select("full_name, email, cpf, phone").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setC((x) => ({ name: x.name || data.full_name || "", email: x.email || data.email || user.email || "", cpf: x.cpf || data.cpf || "", phone: x.phone || data.phone || "" }));
    });
  }, [user, open]);
  const sel = media.filter((m: any) => cart.has(m.id));
  const photos = sel.filter((m: any) => m.kind === "photo").length;
  const videos = sel.filter((m: any) => m.kind === "video").length;
  const t = useMemo(() => cartTotal(album as AlbumPricing, photos, videos, pkg), [album, photos, videos, pkg]);
  const packages = [
    album.pkg_all_photos != null && { k: "fotos", l: "Todas as minhas fotos", v: album.pkg_all_photos },
    album.pkg_all_videos != null && { k: "videos", l: "Todos os meus vídeos", v: album.pkg_all_videos },
    album.pkg_all != null && { k: "tudo", l: "Todas as fotos e vídeos", v: album.pkg_all },
  ].filter(Boolean) as { k: Package; l: string; v: number }[];

  async function pay() {
    if (!user) { navigate({ to: "/auth", search: { redirect: `/fotos/${albumId}` } as any }); return; }
    setSaving(true);
    try {
      const r = await create({ data: { albumId, mediaIds: [...cart], package: pkg, ...(embedding ? { embedding } : {}), ...(coupon.trim() ? { coupon: coupon.trim() } : {}), method, customer: { name: c.name, email: c.email, cpf: c.cpf.replace(/\D/g, ""), phone: c.phone } } });
      toast.success("Pedido criado");
      navigate({ to: "/minhas-fotos", search: { pedido: r.orderId } as any });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader><SheetTitle>Seu carrinho</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-5 px-1">
          <div className="text-sm">
            <p>{photos} fotos × {brl(t.photoUnit)}</p>
            <p>{videos} vídeos × {brl(t.videoUnit)}</p>
            {(album.tiers ?? []).length > 0 && <p className="mt-1 text-xs text-muted-foreground">Desconto progressivo: {(album.tiers as any[]).map((x) => `${x.min_qty}+ itens: ${x.discount_percent ?? 0}% off`).join(" · ")}</p>}
          </div>
          {packages.length > 0 && (
            <div className="space-y-2">
              <Label>Pacotes {!embedding && <span className="text-xs font-normal text-muted-foreground">(faça a busca por selfie para liberar)</span>}</Label>
              {packages.map((p) => (
                <button key={p.k} disabled={!embedding} onClick={() => setPkg(pkg === p.k ? null : p.k)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm disabled:opacity-50 ${pkg === p.k ? "border-primary bg-primary/10" : ""}`}>
                  <span>{p.l}{embedding && <span className="block text-xs text-muted-foreground">{matchedCount} arquivos encontrados</span>}</span><b>{brl(p.v)}</b>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5"><Label>Cupom</Label><Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Opcional" /></div>
          <div className="space-y-2">
            <Label>Seus dados</Label>
            <Input placeholder="Nome completo" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            <Input placeholder="E-mail" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
            <Input placeholder="CPF" inputMode="numeric" value={c.cpf} onChange={(e) => setC({ ...c, cpf: e.target.value })} />
            <Input placeholder="Telefone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button variant={method === "PIX" ? "default" : "outline"} onClick={() => setMethod("PIX")}>Pix</Button>
            <Button variant={method === "CREDIT_CARD" ? "default" : "outline"} onClick={() => setMethod("CREDIT_CARD")}>Cartão</Button>
          </div>
          <div className="flex items-center justify-between border-t pt-4 text-lg"><span>Subtotal</span><b>{brl(t.subtotal)}</b></div>
          {coupon && <p className="text-xs text-muted-foreground">O desconto do cupom é aplicado ao finalizar.</p>}
          <Button variant="hero" className="w-full" disabled={saving || (!cart.size && !pkg)} onClick={pay}>{saving ? "Gerando pagamento..." : user ? "Pagar" : "Entrar para comprar"}</Button>
          <Badge variant="secondary">Entrega sem marca d'água após o pagamento</Badge>
        </div>
      </SheetContent>
    </Sheet>
  );
}
