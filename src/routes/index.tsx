import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CreditCard, QrCode, Receipt, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EventCard } from "@/components/event-card";
import { getBranding, listPublicEvents } from "@/lib/public.functions";
import { HOME_IMAGES } from "@/lib/home-images";

const eventsQuery = queryOptions({
  queryKey: ["public-events", "home"],
  queryFn: () => listPublicEvents({ data: {} }),
});
const brandingQuery = queryOptions({ queryKey: ["branding"], queryFn: () => getBranding(), staleTime: 300_000 });

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const [, branding] = await Promise.all([context.queryClient.ensureQueryData(eventsQuery), context.queryClient.ensureQueryData(brandingQuery)]);
    return branding;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: "Inscreva — Inscrições para corridas, shows e congressos" },
      { name: "description", content: "Encontre eventos e garanta sua inscrição com Pix, boleto ou cartão. Produtores recebem direto na carteira." },
      { property: "og:title", content: "Inscreva — Inscrições para eventos" },
      { property: "og:description", content: "Corridas, shows e congressos com pagamento seguro e comprovante na hora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(loaderData?.images["banner"] ? [{ property: "og:image", content: loaderData.images["banner"] }, { name: "twitter:image", content: loaderData.images["banner"] }] : []),
    ],
  }),
  component: Home,
});

const cats = HOME_IMAGES.filter((image) => image.key !== "banner");

function Home() {
  const { data: events } = useSuspenseQuery(eventsQuery);
  const { data: branding } = useSuspenseQuery(brandingQuery);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  return (
    <div>
      <section className="relative isolate overflow-hidden bg-ink">
        <img src={branding.images["banner"] || HOME_IMAGES[0].fallback} alt="Banner principal" width={1920} height={1088} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 -z-10 bg-gradient-hero" />
        <div className="mx-auto max-w-7xl px-4 pb-24 pt-28 md:pb-32 md:pt-40">
          <p className="mb-4 inline-flex rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-foreground">
            Inscrições abertas
          </p>
          <h1 className="max-w-3xl text-5xl font-extrabold leading-[0.95] text-ink-foreground md:text-7xl">
            Garanta seu lugar no próximo grande evento.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-muted">
            Corridas, pedais, shows e congressos. Pague com Pix, boleto ou cartão e receba seu comprovante na hora.
          </p>
          <form
            className="mt-8 flex max-w-xl gap-2 rounded-2xl bg-card p-2 shadow-card"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ to: "/eventos", search: { q: q || undefined } });
            }}
          >
            <div className="flex flex-1 items-center gap-2 px-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento..." className="border-0 shadow-none focus-visible:ring-0" />
            </div>
            <Button variant="hero" size="lg" type="submit">Buscar</Button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid gap-4 md:grid-cols-3">
          {cats.map((c) => (
            <Link
              key={c.key}
              to="/eventos"
              search={{ categoria: c.key }}
              className="group relative h-44 overflow-hidden rounded-2xl"
            >
              <img src={branding.images[c.key] || c.fallback} alt={c.label} loading="lazy" width={1024} height={768} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-hero" />
              <div className="absolute bottom-4 left-5 flex items-center gap-2 text-2xl font-extrabold text-ink-foreground">
                {c.label} <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-3xl font-extrabold md:text-4xl">Próximos eventos</h2>
          <Link to="/eventos" className="text-sm font-semibold text-primary">Ver todos →</Link>
        </div>
        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
            Nenhum evento publicado ainda. <Link to="/produtor" className="font-semibold text-primary">Seja um produtor</Link> e publique o primeiro.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {events.slice(0, 8).map((e) => <EventCard key={e.id} e={e as any} />)}
          </div>
        )}
      </section>

      <section className="mx-auto mt-24 max-w-7xl px-4">
        <div className="grid gap-10 rounded-3xl bg-ink p-10 text-ink-foreground md:grid-cols-2 md:p-14">
          <div>
            <h2 className="text-3xl font-extrabold md:text-4xl">Organiza eventos? Venda suas inscrições aqui.</h2>
            <p className="mt-4 text-ink-muted">
              Crie o evento, configure lotes e categorias, e receba o dinheiro direto na sua carteira. Acompanhe inscritos e vendas em tempo real.
            </p>
            <Button variant="lime" size="lg" className="mt-6" asChild>
              <Link to="/produtor">Começar a vender</Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { i: QrCode, t: "Pix na hora" },
              { i: CreditCard, t: "Cartão em até 12x" },
              { i: Receipt, t: "Boleto bancário" },
              { i: Wallet, t: "Repasse automático" },
            ].map(({ i: Icon, t }) => (
              <div key={t} className="rounded-2xl bg-sidebar-accent p-5">
                <Icon className="h-6 w-6 text-accent" />
                <p className="mt-3 font-semibold">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
