import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Calendar, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, categoryCover, fmtDate, onlyDigits, ORDER_STATUS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({ meta: [{ title: "Área do atleta — Inscreva" }, { name: "robots", content: "noindex" }] }),
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
                return (
                  <Link key={o.id} to="/pedido/$id" params={{ id: o.id }} className="flex gap-4 rounded-2xl border bg-card p-3 shadow-card transition hover:border-primary">
                    <img src={o.events?.cover_url || categoryCover(o.events?.category)} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1 py-1">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <p className="mt-1.5 truncate font-bold">{o.events?.title}</p>
                      <p className="text-sm text-muted-foreground">{o.ticket_types?.name} · {brl(o.total)}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" /> {fmtDate(o.events?.starts_at)}</p>
                    </div>
                  </Link>
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
  const [f, setF] = useState({ full_name: "", cpf: "", phone: "", birth_date: "", city: "", state: "" });
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
      <div className="sm:col-span-2"><Button variant="hero" type="submit">Salvar</Button></div>
    </form>
  );
}
