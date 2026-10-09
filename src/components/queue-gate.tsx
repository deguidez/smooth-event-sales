import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type QueueState = { status: string; enabled: boolean; position?: number | null; waiting?: number; expires_at?: string | null };

export function QueueGate({ eventId, children }: { eventId: string; children: ReactNode }) {
  const { data, error } = useQuery({
    queryKey: ["queue", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("queue_enter" as any, { _event_id: eventId });
      if (error) throw error;
      return data as unknown as QueueState;
    },
    // Poll while waiting; jitter spreads load from thousands of clients.
    refetchInterval: (q) => (q.state.data?.status === "waiting" ? 5000 + Math.random() * 5000 : false),
    refetchOnWindowFocus: false,
    retry: 5,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="mx-auto max-w-lg px-4 py-20 text-center text-muted-foreground">Muita gente acessando agora. Tentando novamente...</div>;
  if (!data) return <div className="mx-auto max-w-lg px-4 py-20 text-center text-muted-foreground">Entrando na fila...</div>;
  if (!data.enabled) return <>{children}</>;

  if (data.status === "waiting") {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <Users className="mx-auto h-10 w-10 text-primary" />
          <h1 className="mt-4 text-2xl font-extrabold">Você está na fila</h1>
          <p className="mt-2 text-muted-foreground">Muitas pessoas estão se inscrevendo agora. Não feche esta página — ela atualiza sozinha.</p>
          <div className="mt-6 text-5xl font-extrabold text-primary">{data.position ?? "—"}º</div>
          <p className="mt-1 text-sm text-muted-foreground">sua posição · {data.waiting ?? 0} pessoas aguardando</p>
        </div>
      </div>
    );
  }

  const left = data.expires_at ? Math.max(0, new Date(data.expires_at).getTime() - now) : 0;
  if (data.status === "admitted" && left > 0) {
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    return (
      <>
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          <Clock className="h-4 w-4" /> É a sua vez! Conclua a inscrição em {m}:{String(s).padStart(2, "0")}
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-extrabold">Seu tempo acabou</h1>
      <p className="mt-2 text-muted-foreground">Atualize a página para voltar ao final da fila.</p>
    </div>
  );
}
