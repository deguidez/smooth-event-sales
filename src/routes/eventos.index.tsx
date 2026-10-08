import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { EventCard } from "@/components/event-card";
import { listPublicEvents } from "@/lib/public.functions";
import { CATEGORIES } from "@/lib/format";
import { cn } from "@/lib/utils";

const search = z.object({ categoria: z.string().optional(), q: z.string().optional() });

const q = (categoria?: string, text?: string) =>
  queryOptions({
    queryKey: ["public-events", categoria ?? "", text ?? ""],
    queryFn: () => listPublicEvents({ data: { category: categoria, q: text } }),
  });

export const Route = createFileRoute("/eventos/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(q(deps.categoria, deps.q)),
  head: () => ({
    meta: [
      { title: "Eventos — Inscreva" },
      { name: "description", content: "Todos os eventos com inscrições abertas: corridas, ciclismo, shows e congressos." },
      { property: "og:title", content: "Eventos com inscrições abertas — Inscreva" },
      { property: "og:description", content: "Encontre e garanta sua inscrição." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventsPage,
});

function EventsPage() {
  const { categoria, q: text } = Route.useSearch();
  const { data } = useSuspenseQuery(q(categoria, text));
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="text-4xl font-extrabold md:text-5xl">Eventos</h1>
      {text && <p className="mt-2 text-muted-foreground">Resultados para “{text}”</p>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/eventos" className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", !categoria && "bg-ink text-ink-foreground")}>
          Todos
        </Link>
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <Link
            key={k}
            to="/eventos"
            search={{ categoria: k }}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", categoria === k && "bg-ink text-ink-foreground")}
          >
            {v}
          </Link>
        ))}
      </div>
      {data.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum evento encontrado.</div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {data.map((e) => <EventCard key={e.id} e={e as any} />)}
        </div>
      )}
    </div>
  );
}
