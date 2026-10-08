import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBranding } from "@/lib/public.functions";
import { useEffect, useState } from "react";
import { LogOut, Shield, Ticket, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function Logo() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { data } = useQuery({ queryKey: ["branding"], queryFn: () => getBranding(), staleTime: 300_000 });
  if (!hydrated) return <Link to="/" aria-label="Página principal" className="block h-9 w-[180px]" />;
  if (data?.logo)
    return (
      <Link to="/" className="flex items-center">
        <img src={data.logo} alt={data.name} className="h-9 max-w-[180px] object-contain" />
      </Link>
    );
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-brand text-primary-foreground">
        <Ticket className="h-4 w-4" />
      </span>
      <span className="font-display text-xl font-extrabold tracking-tight">{data?.name ?? "Inscreva"}</span>
    </Link>
  );
}

export function SiteHeader() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          <Link to="/eventos" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
            Eventos
          </Link>
        </nav>
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <User />
                <span className="hidden max-w-[140px] truncate sm:inline">{user.email}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => navigate({ to: "/minha-conta" })}>
                <Ticket /> Área do atleta
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
                  <Shield /> Super admin
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button variant="hero" asChild>
              <Link to="/auth" search={{ mode: "signup" }}>Criar conta</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print mt-24 bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-3">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-ink-muted">Inscrições para corridas, shows, congressos e qualquer evento — com pagamento seguro.</p>
        </div>
        <div className="text-sm text-ink-muted">
          <p className="font-semibold text-ink-foreground">Pagamentos</p>
          <p className="mt-2">Pix, boleto e cartão de crédito em até 12x.</p>
        </div>
        <div className="text-sm text-ink-muted">
          <p className="font-semibold text-ink-foreground">Produtores</p>
          <p className="mt-2">Receba direto na sua carteira, sem intermediários.</p>
        </div>
      </div>
    </footer>
  );
}
