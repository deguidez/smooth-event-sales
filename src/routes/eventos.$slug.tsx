import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Calendar, FileText, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublicEvent } from "@/lib/public.functions";
import { brl, CATEGORIES, categoryCover, fmtDate } from "@/lib/format";

const eventQuery = (slug: string) =>
  queryOptions({ queryKey: ["public-event", slug], queryFn: () => getPublicEvent({ data: { slug } }) });

export const Route = createFileRoute("/eventos/$slug")({
  loader: async ({ context, params }) => {
    const ev = await context.queryClient.ensureQueryData(eventQuery(params.slug));
    if (!ev) throw notFound();
    return { title: ev.title, desc: ev.short_description, cover: ev.cover_url };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Evento não encontrado" }, { name: "robots", content: "noindex" }] };
    const meta: any[] = [
      { title: `${loaderData.title} — Inscreva` },
      { name: "description", content: loaderData.desc ?? `Inscrições para ${loaderData.title}` },
      { property: "og:title", content: loaderData.title },
      { property: "og:description", content: loaderData.desc ?? `Inscrições para ${loaderData.title}` },
    ];
    if (loaderData.cover?.startsWith("https://")) {
      meta.push({ property: "og:image", content: loaderData.cover }, { name: "twitter:image", content: loaderData.cover });
    }
    return { meta };
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-bold">Evento não encontrado</h1>
      <Link to="/eventos" className="mt-4 inline-block text-primary">Ver eventos</Link>
    </div>
  ),
  component: EventPage,
});

function EventPage() {
  const { slug } = Route.useParams();
  const { data: ev } = useSuspenseQuery(eventQuery(slug));
  if (!ev) return null;
  const tickets = [...(ev.ticket_types ?? [])].filter((t) => t.active).sort((a, b) => a.position - b.position);
  const now = Date.now();
  const closed = ev.status !== "publicado";

  return (
    <div>
      <div className="relative h-[42vh] min-h-[300px] overflow-hidden bg-ink">
        <img src={ev.cover_url || categoryCover(ev.category)} alt={ev.title} className="h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-8">
          <Badge variant="lime">{CATEGORIES[ev.category as keyof typeof CATEGORIES]}</Badge>
          <h1 className="mt-3 max-w-4xl text-4xl font-extrabold text-ink-foreground md:text-6xl">{ev.title}</h1>
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-6 text-sm">
            <span className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> {fmtDate(ev.starts_at, true)}</span>
            {(ev.venue || ev.city) && (
              <span className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" /> {[ev.venue, ev.city, ev.state].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          {ev.short_description && <p className="text-lg font-medium">{ev.short_description}</p>}
          <div className="whitespace-pre-line leading-relaxed text-muted-foreground">{ev.description}</div>
          {(ev as any).event_documents?.length > 0 && (
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="text-xl font-bold">Documentos</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {[...(ev as any).event_documents].sort((a: any, b: any) => a.position - b.position).map((d: any) => (
                  <li key={d.id}>
                    <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border p-3 transition hover:border-primary">
                      <FileText className="h-5 w-5 shrink-0 text-primary" />
                      <span><span className="block font-semibold">{d.title}</span><span className="text-xs text-muted-foreground">{d.is_file ? "PDF" : "Link"} · abrir</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <aside className="h-fit space-y-3 rounded-2xl border bg-card p-5 shadow-card lg:sticky lg:top-24">
          <h2 className="text-xl font-bold">Inscrições</h2>
          {tickets.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria disponível.</p>}
          {tickets.map((t) => {
            const soldOut = t.sold >= t.quantity;
            const notYet = t.sales_start && new Date(t.sales_start).getTime() > now;
            const ended = t.sales_end && new Date(t.sales_end).getTime() < now;
            const disabled = closed || soldOut || !!notYet || !!ended;
            return (
              <div key={t.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" /> {Math.max(0, t.quantity - t.sold)} vagas
                    </p>
                  </div>
                  <p className="font-display text-xl font-extrabold text-primary">{Number(t.price) === 0 ? "Grátis" : brl(t.price)}</p>
                </div>
                <Button variant="hero" className="mt-3 w-full" disabled={disabled} asChild={!disabled}>
                  {disabled ? (
                    <span>{soldOut ? "Esgotado" : notYet ? "Em breve" : "Encerrado"}</span>
                  ) : (
                    <Link to="/checkout/$ticketId" params={{ ticketId: t.id }}>Inscrever-se</Link>
                  )}
                </Button>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
