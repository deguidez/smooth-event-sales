import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

export function EventCountdown({ startsAt }: { startsAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return null;
  const remaining = now === null ? null : Math.max(0, Math.floor((start - now) / 1000));
  if (remaining === 0) return <p className="flex items-center gap-2 font-semibold text-primary"><Timer className="h-5 w-5" /> O evento já começou</p>;
  const values = remaining === null ? [null, null, null, null] : [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
  return <section aria-label="Contagem regressiva para o evento" className="border-y py-5">
    <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Timer className="h-4 w-4 text-primary" /> Falta para o evento</h2>
    <div className="grid max-w-md grid-cols-4 gap-3 text-center">
      {values.map((value, index) => <div key={index} className="min-w-0">
        <span className="block font-display text-3xl font-extrabold tabular-nums text-primary sm:text-4xl">{value === null ? "—" : String(value).padStart(2, "0")}</span>
        <span className="text-xs text-muted-foreground">{["dias", "horas", "minutos", "segundos"][index]}</span>
      </div>)}
    </div>
  </section>;
}