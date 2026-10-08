import { useAuth } from "@/hooks/use-auth";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, roles } = useAuth();
  if (!roles.length) return <div className="mx-auto max-w-6xl px-4 py-20 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-2xl font-bold">Acesso restrito</h1><p className="mt-2 text-muted-foreground">Esta área é exclusiva do super admin.</p></div>;
  return <>{children}</>;
}

