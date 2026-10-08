import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LucideIcon } from "lucide-react";
import { brl } from "@/lib/format";

export function StatCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SalesChart({ orders }: { orders: { created_at: string; total: number | string; status: string }[] }) {
  const days: { d: string; v: number }[] = [];
  const map = new Map<string, number>();
  for (const o of orders) {
    if (o.status !== "pago") continue;
    const k = o.created_at.slice(0, 10);
    map.set(k, (map.get(k) ?? 0) + Number(o.total));
  }
  for (let i = 29; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const k = dt.toISOString().slice(0, 10);
    days.push({ d: k.slice(8, 10) + "/" + k.slice(5, 7), v: map.get(k) ?? 0 });
  }
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <p className="mb-4 font-semibold">Vendas confirmadas — últimos 30 dias</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="d" fontSize={11} tickLine={false} axisLine={false} interval={4} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} width={60} />
            <Tooltip formatter={(v: number) => brl(v)} />
            <Bar dataKey="v" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function toCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => esc(r[h])).join(";"))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}
