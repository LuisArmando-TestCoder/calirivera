"use client";
import { useEffect, useRef, type ReactNode } from "react";
import s from "./shared.module.scss";

/** Native <dialog>: bottom sheet on phones, centered panel on desktop. Esc / backdrop close. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      data-wide={wide ? "" : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="cms-sheet-title"
    >
      {open && (
        <div className={s.sheetInner}>
          <header className={s.sheetHead}>
            <h2 id="cms-sheet-title">{title}</h2>
            <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Cerrar">
              ×
            </button>
          </header>
          <div className={s.sheetBody}>{children}</div>
          {footer && <footer className={s.sheetFoot}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  extra,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** Optional third choice (e.g. "Salir sin guardar"). */
  extra?: { label: string; run: () => void };
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className={s.btn} onClick={onClose}>
            Cancelar
          </button>
          {extra && (
            <button
              type="button"
              className={s.btn}
              onClick={() => {
                onClose();
                extra.run();
              }}
            >
              {extra.label}
            </button>
          )}
          <button
            type="button"
            className={danger ? s.btnDanger : s.btnPrimary}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {body && <div className={s.prose}>{body}</div>}
    </Sheet>
  );
}
