import { Link } from "@tanstack/react-router";
import { Calendar, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { brl, CATEGORIES, categoryCover, fmtDate } from "@/lib/format";

export type EventCardData = {
  id: string;
  title: string;
  slug: string;
  category: string;
  cover_url: string | null;
  city: string | null;
  state: string | null;
  starts_at: string;
  ticket_types?: { price: number; active: boolean }[] | null;
};

export function EventCard({ e }: { e: EventCardData }) {
  const prices = (e.ticket_types ?? []).filter((t) => t.active).map((t) => Number(t.price));
  const min = prices.length ? Math.min(...prices) : null;
  return (
    <Link
      to="/eventos/$slug"
      params={{ slug: e.slug }}
      className="group overflow-hidden rounded-2xl border bg-card shadow-card transition hover:-translate-y-1"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={e.cover_url || categoryCover(e.category)}
          alt={e.title}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <Badge variant="lime" className="absolute left-3 top-3">
          {CATEGORIES[e.category as keyof typeof CATEGORIES] ?? e.category}
        </Badge>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-2 text-lg font-bold leading-tight">{e.title}</h3>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" /> {fmtDate(e.starts_at)}
          </span>
          {e.city && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {e.city}
              {e.state ? ` - ${e.state}` : ""}
            </span>
          )}
        </div>
        <p className="pt-1 text-sm">
          {min === null ? (
            <span className="text-muted-foreground">Em breve</span>
          ) : min === 0 ? (
            <span className="font-bold text-success">Gratuito</span>
          ) : (
            <>
              a partir de <span className="font-bold text-primary">{brl(min)}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
