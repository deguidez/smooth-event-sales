import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { recordBrowserActivity } from "@/lib/activity.functions";

export function ActivityRecorder() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const record = useServerFn(recordBrowserActivity);
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    void record({ data: { action: "page_view", path: pathname } }).catch(() => {});
  }, [user?.id, pathname, record]);
  useEffect(() => {
    if (!user) return;
    const emit = (action: "browser_error" | "query_error" | "mutation_error") => {
      void record({ data: { action, path: window.location.pathname, category: action === "browser_error" ? "runtime" : "application" } }).catch(() => {});
    };
    const onError = () => emit("browser_error");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onError);
    const queryUnsub = qc.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") emit("query_error");
    });
    const mutationUnsub = qc.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") emit("mutation_error");
    });
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onError); queryUnsub(); mutationUnsub(); };
  }, [user?.id, record, qc]);
  return null;
}