import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
import hero from "@/assets/hero.jpg";

const search = z.object({
  mode: z.enum(["login", "signup"]).optional(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Entrar — Inscreva" },
      { name: "description", content: "Acesse sua conta para se inscrever em eventos e acompanhar seus pagamentos." },
      { property: "og:title", content: "Entrar — Inscreva" },
      { property: "og:description", content: "Acesse sua conta Inscreva." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function safeRedirect(r?: string) {
  if (!r) return "/minha-conta";
  try {
    const u = new URL(r, window.location.origin);
    if (u.origin !== window.location.origin) return "/minha-conta";
    return u.pathname + u.search;
  } catch {
    return "/minha-conta";
  }
}

function AuthPage() {
  const { mode = "login", redirect } = Route.useSearch();
  const [tab, setTab] = useState<"login" | "signup">(mode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { user, loading, isProducer } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || loading) return;
    const storedRedirect = sessionStorage.getItem("post_auth");
    sessionStorage.removeItem("post_auth");
    if (isProducer) {
      navigate({ to: "/produtor", replace: true });
    } else {
      navigate({ to: safeRedirect(storedRedirect || redirect) as any, replace: true });
    }
  }, [user, loading, isProducer, redirect, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth", data: { full_name: name } },
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message === "Invalid login credentials" ? "E-mail ou senha incorretos" : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (redirect) sessionStorage.setItem("post_auth", safeRedirect(redirect));
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error("Não foi possível entrar com o Google");
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
      <div className="relative hidden overflow-hidden rounded-3xl md:block">
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" width={1920} height={1088} />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="absolute bottom-0 p-8 text-ink-foreground">
          <h2 className="text-3xl font-extrabold">Sua próxima largada começa aqui.</h2>
          <p className="mt-2 text-ink-muted">Inscrições, comprovantes e pagamentos em um só lugar.</p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-md self-center">
        {sent ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
            <h1 className="text-2xl font-bold">Confirme seu e-mail</h1>
            <p className="mt-2 text-muted-foreground">Enviamos um link para <b>{email}</b>. Clique nele para ativar sua conta.</p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-8 shadow-card">
            <h1 className="text-3xl font-extrabold">{tab === "login" ? "Bem-vindo de volta" : "Crie sua conta"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "login" ? "Entre para ver suas inscrições." : "Leva menos de um minuto."}
            </p>
            <Button variant="outline" className="mt-6 w-full" onClick={google} type="button">
              Continuar com Google
            </Button>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={submit} className="space-y-4">
              {tab === "signup" && (
                <div className="space-y-1.5">
                  <Label>Nome completo</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" variant="hero" className="w-full" size="lg" disabled={busy}>
                {busy ? "Aguarde..." : tab === "login" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {tab === "login" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
              <button className="font-semibold text-primary" onClick={() => setTab(tab === "login" ? "signup" : "login")}>
                {tab === "login" ? "Cadastre-se" : "Entrar"}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
