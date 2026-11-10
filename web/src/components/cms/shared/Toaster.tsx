"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import s from "./shared.module.scss";

export interface Toast {
  id: number;
  text: string;
  tone?: "ok" | "error" | "info";
  action?: { label: string; run: () => void | Promise<void> };
  ms?: number;
}

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
  }, []);
  const remove = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className={s.toasts} role="status" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDone={() => remove(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, toast.ms ?? (toast.action ? 10_000 : 4_000));
    return () => clearTimeout(id);
  }, [toast, onDone]);
  return (
    <div className={s.toast} data-tone={toast.tone ?? "info"}>
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className={s.toastAction}
          onClick={async () => {
            onDone();
            await toast.action!.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className={s.toastClose} aria-label="Cerrar aviso" onClick={onDone}>
        ×
      </button>
    </div>
  );
}
