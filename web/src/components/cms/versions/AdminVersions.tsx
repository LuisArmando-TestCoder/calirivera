"use client";
import { useRouter } from "next/navigation";
import { useToast } from "../shared/Toaster";
import { noteCommit } from "../overlay/local";
import { Versions } from "./Versions";

/** Las versiones de todo el sitio, en el Panel. */
export function AdminVersions() {
  const toast = useToast();
  const router = useRouter();
  return (
    <Versions
      onPage
      onRestored={(r, label) => {
        if (!r.ok) return void toast({ text: r.error, tone: "error", ms: 8000 });
        if (r.deploys) {
          noteCommit(r, label);
          toast({ text: "Volviendo a esa versión. En unos minutos el sitio la muestra.", tone: "ok", ms: 7000 });
        } else toast({ text: "Listo: el sitio ya muestra esa versión.", tone: "ok" });
        router.refresh();
      }}
    />
  );
}
