"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { purgeDocAction, restoreDocAction, revertAction, setStatusAction } from "@/app/admin/actions";
import { useToast } from "../shared/Toaster";
import { Confirm } from "../shared/Sheet";
import s from "./admin.module.scss";

export function RevertButton({ auditId, title, what }: { auditId: string; title: string; what: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <button type="button" className={s.btnSmall} disabled={pending} onClick={() => setOpen(true)}>
        ↶ Deshacer
      </button>
      <Confirm
        open={open}
        title={`¿Deshacer «${what}» en «${title}»?`}
        body={<p>Vuelve a quedar como estaba antes de ese cambio. Este deshacer también queda en el historial.</p>}
        confirmLabel="Sí, deshacer"
        onClose={() => setOpen(false)}
        onConfirm={() =>
          start(async () => {
            const r = await revertAction(auditId);
            toast({ text: r.ok ? "Listo, quedó como antes." : (r.error ?? "No se pudo"), tone: r.ok ? "ok" : "error" });
            router.refresh();
          })
        }
      />
    </>
  );
}

export function TrashRowActions({ collection, id, title }: { collection: string; id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <div className={s.row}>
      <button
        type="button"
        className={s.btnSmall}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await restoreDocAction(collection, id);
            toast({ text: r.ok ? `«${title}» recuperado.` : (r.error ?? "Error"), tone: r.ok ? "ok" : "error" });
            router.refresh();
          })
        }
      >
        Recuperar
      </button>
      <button type="button" className={s.btnSmallDanger} disabled={pending} onClick={() => setOpen(true)}>
        Borrar para siempre
      </button>
      <Confirm
        open={open}
        title={`¿Borrar «${title}» para siempre?`}
        body={<p>Esto no se puede deshacer.</p>}
        confirmLabel="Borrar para siempre"
        danger
        onClose={() => setOpen(false)}
        onConfirm={() =>
          start(async () => {
            const r = await purgeDocAction(collection, id);
            toast({ text: r.ok ? "Borrado." : (r.error ?? "Error"), tone: r.ok ? "info" : "error" });
            router.refresh();
          })
        }
      />
    </div>
  );
}

/** Un toque para aprobar (publicar) u ocultar (borrador) — pensado para los recuerdos que pasaron por IA. */
export function QuickStatus({ collection, id, status, title }: { collection: string; id: string; status: "draft" | "published"; title: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const next = status === "published" ? "draft" : "published";
  return (
    <button
      type="button"
      className={s.btnSmall} data-primary={next === "published" ? "" : undefined}
      disabled={pending}
      aria-label={`${next === "published" ? "Aprobar y mostrar" : "Ocultar"} «${title}»`}
      onClick={() =>
        start(async () => {
          const r = await setStatusAction(collection, id, next);
          toast({
            text: r.ok ? (next === "published" ? `«${title}» ya se ve en el sitio.` : `«${title}» quedó oculto.`) : (r.error ?? "No se pudo"),
            tone: r.ok ? "ok" : "error",
            action: r.ok ? { label: "Deshacer", run: async () => { await setStatusAction(collection, id, status); router.refresh(); } } : undefined,
          });
          router.refresh();
        })
      }
    >
      {next === "published" ? "✓ Aprobar" : "Ocultar"}
    </button>
  );
}
