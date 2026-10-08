import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_TERMS, parseTerms, type EventTerm } from "@/lib/terms";

export function TermsEditor({ value, onChange }: { value: unknown; onChange: (v: EventTerm[]) => void }) {
  const terms = parseTerms(value);
  const upd = (i: number, p: Partial<EventTerm>) => onChange(terms.map((t, j) => (j === i ? { ...t, ...p } : t)));
  return (
    <div className="space-y-4">
      {terms.map((t, i) => {
        const custom = !DEFAULT_TERMS.some((d) => d.id === t.id);
        return (
          <div key={t.id} className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <Switch checked={t.enabled} onCheckedChange={(v) => upd(i, { enabled: v })} />
              <Input value={t.title} onChange={(e) => upd(i, { title: e.target.value })} className="font-semibold" maxLength={150} />
              {custom && (
                <Button variant="ghost" size="icon" onClick={() => onChange(terms.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              )}
            </div>
            {t.enabled && <Textarea rows={5} value={t.text} onChange={(e) => upd(i, { text: e.target.value })} maxLength={8000} />}
          </div>
        );
      })}
      <Button variant="outline" onClick={() => onChange([...terms, { id: crypto.randomUUID(), title: "Novo termo", text: "", enabled: true }])}>
        <Plus className="h-4 w-4" /> Adicionar termo
      </Button>
    </div>
  );
}

export function TermsAccept({ terms, accepted, onChange }: { terms: EventTerm[]; accepted: string[]; onChange: (v: string[]) => void }) {
  if (!terms.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-6 shadow-card">
      <h2 className="text-lg font-bold">Termos</h2>
      {terms.map((t) => (
        <div key={t.id} className="rounded-xl border p-4">
          <p className="font-semibold">{t.title}</p>
          <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line text-sm text-muted-foreground">{t.text}</div>
          <label className="mt-3 flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={accepted.includes(t.id)}
              onCheckedChange={(v) => onChange(v ? [...accepted, t.id] : accepted.filter((x) => x !== t.id))}
            />
            Li e aceito
          </label>
        </div>
      ))}
    </section>
  );
}
