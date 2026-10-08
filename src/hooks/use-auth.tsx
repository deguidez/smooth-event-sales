import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: string[];
  isAdmin: boolean;
  isProducer: boolean;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  roles: [],
  isAdmin: false,
  isProducer: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const { data: roles = [] } = useQuery({
    queryKey: ["roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId!);
      return (data ?? []).map((r) => r.role as string);
    },
  });

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        roles,
        isAdmin: roles.includes("super_admin"),
        isProducer: roles.includes("producer"),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
