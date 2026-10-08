import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { uploadEventFile } from "@/components/event-files";
import { brl } from "@/lib/format";

const parseSizes = (s: string) => s.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 15);

export function ProductsEditor({ eventId, producerId }: { eventId: string; producerId: string }) {
  const qc = useQueryClient();
  const key = ["event-products", eventId];
  const { data: products = [] } = useQuery({
    queryKey: key,
    queryFn: async () => (await supabase.from("event_products").select("*").eq("event_id", eventId).order("position")).data ?? [],
  });
  const empty = { name: "", description: "", price: "", sizes: "", stock: "", image_url: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function pickImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Escolha uma imagem"); return; }
    setBusy(true);
    try { setF({ ...f, image_url: await uploadEventFile(producerId, file) }); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  async function add() {
    const price = Number(f.price.replace(",", "."));
    if (f.name.trim().length < 2 || !(price >= 0)) { toast.error("Informe nome e preço"); return; }
    const { error } = await supabase.from("event_products").insert({
      event_id: eventId, name: f.name.trim(), description: f.description.trim() || null, price,
      sizes: parseSizes(f.sizes), stock: f.stock ? Number(f.stock) : null, image_url: f.image_url || null, position: products.length,
    });
    if (error) { toast.error(error.message); return; }
    setF(empty); toast.success("Produto adicionado"); refresh();
  }
  async function patch(id: string, p: any) { const { error } = await supabase.from("event_products").update(p).eq("id", id); if (error) toast.error(error.message); refresh(); }
  async function remove(id: string) { const { error } = await supabase.from("event_products").delete().eq("id", id); if (error) toast.error(error.message); else toast.success("Produto removido"); refresh(); }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-card">
        <div>
          <h3 className="text-lg font-bold">Novo produto</h3>
          <p className="text-sm text-muted-foreground">Camisa extra, boné, medalha, foto... O atleta escolhe no checkout e o valor é somado ao total.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <button type="button" onClick={() => ref.current?.click()} className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-muted-foreground hover:border-primary">
            {f.image_url ? <img src={f.image_url} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus className="h-6 w-6" />{busy ? "Enviando..." : "Foto"}</span>}
          </button>
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Camisa oficial extra" /></div>
            <div className="space-y-1.5"><Label>Preço (R$)</Label><Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="59,90" /></div>
            <div className="space-y-1.5"><Label>Estoque (vazio = sem limite)</Label><Input type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Tamanhos (separe por vírgula)</Label><Input value={f.sizes} onChange={(e) => setF({ ...f, sizes: e.target.value })} placeholder="P, M, G, GG (deixe vazio se não tiver)" /></div>
            <div className="space-y-1.5"><Label>Descrição</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={200} /></div>
          </div>
        </div>
        <Button variant="hero" onClick={add} disabled={busy}><Plus /> Adicionar produto</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto ainda.</p>}
        {products.map((p: any) => (
          <div key={p.id} className="overflow-hidden rounded-2xl border bg-card shadow-card">
            {p.image_url && <img src={p.image_url} alt={p.name} className="aspect-[4/3] w-full object-cover" />}
            <div className="space-y-2 p-4">
              <div className="flex justify-between gap-2"><p className="font-semibold">{p.name}</p><p className="font-bold text-primary">{brl(p.price)}</p></div>
              <p className="text-xs text-muted-foreground">{p.sizes.length ? `Tamanhos: ${p.sizes.join(", ")} · ` : ""}Vendidos: {p.sold}{p.stock != null ? ` / ${p.stock}` : ""}</p>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm"><Switch checked={p.active} onCheckedChange={(v) => patch(p.id, { active: v })} /> À venda</label>
                <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
