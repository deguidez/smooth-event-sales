import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FIELD_TYPES, type CustomField } from "@/lib/custom-fields";

export function CustomFieldsEditor({ value, onChange }: { value: CustomField[]; onChange: (v: CustomField[]) => void }) {
  const upd = (i: number, p: Partial<CustomField>) => onChange(value.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div className="space-y-4">
      {value.map((f, i) => (
        <div key={f.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_200px_auto_auto] sm:items-end">
          <div className="space-y-1.5"><Label>Pergunta</Label><Input value={f.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="Ex.: Tipo sanguíneo" maxLength={120} /></div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={f.type} onValueChange={(v) => upd(i, { type: v as CustomField["type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(FIELD_TYPES).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={f.required} onCheckedChange={(v) => upd(i, { required: v })} /> Obrigatório</label>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 /></Button>
          {(f.type === "select" || f.type === "checkbox") && (
            <div className="space-y-1.5 sm:col-span-4">
              <Label>{f.type === "select" ? "Opções da lista (separe por vírgula)" : "Opções para marcar (separe por vírgula; vazio = uma caixa só de sim/não)"}</Label>
              <Input value={f.options.join(", ")} onChange={(e) => upd(i, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => onChange([...value, { id: crypto.randomUUID().slice(0, 8), label: "", type: "text", required: false, options: [] }])}>
        <Plus /> Adicionar campo
      </Button>
    </div>
  );
}

export function CustomFieldsForm({ fields, answers, onChange }: { fields: CustomField[]; answers: Record<string, any>; onChange: (a: Record<string, any>) => void }) {
  const set = (id: string, v: any) => onChange({ ...answers, [id]: v });
  return (
    <>
      {fields.map((f) => {
        const label = f.label + (f.required ? " *" : "");
        const v = answers[f.id];
        return (
          <div key={f.id} className={`space-y-1.5 ${f.type === "textarea" || f.type === "checkbox" ? "sm:col-span-2" : ""}`}>
            {!(f.type === "checkbox" && !f.options.length) && <Label>{label}</Label>}
            {f.type === "text" && <Input value={v ?? ""} onChange={(e) => set(f.id, e.target.value)} maxLength={200} />}
            {f.type === "textarea" && <Textarea rows={3} value={v ?? ""} onChange={(e) => set(f.id, e.target.value)} maxLength={2000} />}
            {f.type === "select" && (
              <Select value={v ?? ""} onValueChange={(x) => set(f.id, x)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {f.type === "checkbox" && !f.options.length && (
              <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={!!v} onCheckedChange={(c) => set(f.id, !!c)} /> {label}</label>
            )}
            {f.type === "checkbox" && f.options.length > 0 && (
              <div className="flex flex-wrap gap-4">
                {f.options.map((o) => {
                  const arr: string[] = Array.isArray(v) ? v : [];
                  return (
                    <label key={o} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={arr.includes(o)} onCheckedChange={(c) => set(f.id, c ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
