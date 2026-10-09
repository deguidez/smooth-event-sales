import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderQrDialog, OrderQrImage } from "@/components/order-qr";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, categoryCover, fmtDate, onlyDigits, ORDER_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({ meta: [{ title: "Área do atleta — Inscreva" }, { name: "description", content: "Acompanhe suas inscrições e pagamentos na Inscreva." }, { property: "og:title", content: "Área do atleta — Inscreva" }, { property: "og:description", content: "Acompanhe suas inscrições e pagamentos na Inscreva." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { name: "robots", content: "noindex" }] }),
  component: AthleteArea,
});

function AthleteArea() {
  const { user } = useAuth();
  const { data: orders = [] } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, code, status, total, created_at, events(title, starts_at, category, cover_url, city), ticket_types(name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const upcoming = orders.filter((o) => o.status === "pago" && o.events && new Date(o.events.starts_at) > new Date());

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 rounded-3xl bg-ink p-8 text-ink-foreground">
        <p className="text-sm text-ink-muted">Área do atleta</p>
        <h1 className="text-3xl font-extrabold md:text-4xl">Olá{user?.user_metadata?.["full_name"] ? `, ${String(user.user_metadata["full_name"]).split(" ")[0]}` : ""}!</h1>
        <div className="mt-6 grid grid-cols-3 gap-4 md:max-w-lg">
          <Stat n={orders.length} l="Inscrições" />
          <Stat n={orders.filter((o) => o.status === "pago").length} l="Confirmadas" />
          <Stat n={upcoming.length} l="Próximos" />
        </div>
      </div>
      <Tabs defaultValue="inscricoes">
        <TabsList>
          <TabsTrigger value="inscricoes">Minhas inscrições</TabsTrigger>
          <TabsTrigger value="perfil">Meus dados</TabsTrigger>
        </TabsList>
        <TabsContent value="inscricoes" className="mt-6">
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center">
              <Ticket className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-muted-foreground">Você ainda não tem inscrições.</p>
              <Button variant="hero" className="mt-4" asChild><Link to="/eventos">Encontrar eventos</Link></Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {orders.map((o) => {
                const st = ORDER_STATUS[o.status]!;
                const paid = o.status === "pago";
                return (
                  <div key={o.id} className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition hover:border-primary">
                    <Link to="/pedido/$id" params={{ id: o.id }} className="flex gap-4 p-3">
                      <img src={o.events?.cover_url || categoryCover(o.events?.category)} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1 py-1">
                        <Badge variant={st.variant}>{st.label}</Badge>
                        <p className="mt-1.5 truncate font-bold">{o.events?.title}</p>
                        <p className="text-sm text-muted-foreground">{o.ticket_types?.name} · {brl(o.total)}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" /> {fmtDate(o.events?.starts_at)}</p>
                      </div>
                    </Link>
                    {paid && (
                      <div className="mt-auto flex items-center gap-3 border-t bg-muted/40 px-3 py-2.5">
                        <OrderQrImage orderId={o.id} size={52} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold">Código {o.code}</p>
                          <p className="text-[11px] leading-tight text-muted-foreground">Apresente na retirada do kit ou na entrada.</p>
                        </div>
                        <OrderQrDialog orderId={o.id} code={o.code} title={o.events?.title} className="shrink-0" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
        <TabsContent value="perfil" className="mt-6">
          <ProfileForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-2xl bg-sidebar-accent p-4">
      <p className="font-display text-3xl font-extrabold text-accent">{n}</p>
      <p className="text-xs text-ink-muted">{l}</p>
    </div>
  );
}

function ProfileForm() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ full_name: "", cpf: "", phone: "", birth_date: "", city: "", state: "", emergency_contact_name: "", emergency_contact_phone: "", is_pcd: false, pcd_description: "" });
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data }) => {
      if (data)
        setF({
          full_name: data.full_name ?? "",
          cpf: data.cpf ?? "",
          phone: data.phone ?? "",
          birth_date: data.birth_date ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
          emergency_contact_name: data.emergency_contact_name ?? "",
          emergency_contact_phone: data.emergency_contact_phone ?? "",
          is_pcd: data.is_pcd ?? false,
          pcd_description: data.pcd_description ?? "",
        });
    });
  }, [user]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("profiles")
      .update({ ...f, cpf: onlyDigits(f.cpf), birth_date: f.birth_date || null })
      .eq("id", user!.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Dados salvos");
      qc.invalidateQueries();
    }
  }
  return (
    <form onSubmit={save} className="grid max-w-2xl gap-4 rounded-2xl border bg-card p-6 shadow-card sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2"><Label>Nome completo</Label><Input value={f.full_name} onChange={set("full_name")} maxLength={120} /></div>
      <div className="space-y-1.5"><Label>CPF</Label><Input value={f.cpf} onChange={set("cpf")} /></div>
      <div className="space-y-1.5"><Label>Celular</Label><Input value={f.phone} onChange={set("phone")} /></div>
      <div className="space-y-1.5"><Label>Nascimento</Label><Input type="date" value={f.birth_date} onChange={set("birth_date")} /></div>
      <div className="space-y-1.5"><Label>Cidade</Label><Input value={f.city} onChange={set("city")} /></div>
      <div className="space-y-1.5"><Label>UF</Label><Input value={f.state} onChange={set("state")} maxLength={2} /></div>
      <div className="space-y-1.5"><Label>Contato de emergência (nome)</Label><Input value={f.emergency_contact_name} onChange={set("emergency_contact_name")} maxLength={120} placeholder="Nome de quem avisar" /></div>
      <div className="space-y-1.5"><Label>Telefone de emergência</Label><Input value={f.emergency_contact_phone} onChange={set("emergency_contact_phone")} maxLength={20} placeholder="(11) 99999-9999" /></div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox id="is_pcd" checked={f.is_pcd} onCheckedChange={(v) => setF({ ...f, is_pcd: v === true })} />
        <Label htmlFor="is_pcd" className="cursor-pointer font-normal">Sou pessoa com deficiência (PCD)</Label>
      </div>
      {f.is_pcd && (
        <div className="space-y-1.5 sm:col-span-2"><Label>Qual deficiência?</Label><Input value={f.pcd_description} onChange={set("pcd_description")} maxLength={200} placeholder="Ex.: mobilidade reduzida, deficiência visual..." /></div>
      )}
      <div className="sm:col-span-2"><Button variant="hero" type="submit">Salvar</Button></div>
    </form>
  );
}
