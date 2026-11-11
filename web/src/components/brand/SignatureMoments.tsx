"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Signature } from "./Signature";
import s from "./moments.module.scss";

/** Marca a su contenedor con `is-inview` la primera vez que entra en pantalla (dispara las firmas "view"). */
export function SignatureInView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.classList.add("is-inview");
        io.disconnect();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * La firma como gesto del sitio:
 *  - al entrar a cada página, Cali «firma» la esquina (se escribe, queda un momento y se va);
 *  - cuando publica desde el editor (evento "firma"), firma en grande al centro: lo publicado lleva su firma.
 */
export function SignatureMoments() {
  const pathname = usePathname();
  const [corner, setCorner] = useState(0);
  const [big, setBig] = useState<{ n: number; text: string } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) return void (first.current = false); // en la primera carga firma la cabecera
    setCorner((n) => n + 1);
  }, [pathname]);

  useEffect(() => {
    let t = 0;
    const on = (e: Event) => {
      const text = (e as CustomEvent<string>).detail || "Publicado";
      setBig((b) => ({ n: (b?.n ?? 0) + 1, text }));
      clearTimeout(t);
      t = window.setTimeout(() => setBig(null), 3600);
    };
    addEventListener("firma", on);
    return () => {
      clearTimeout(t);
      removeEventListener("firma", on);
    };
  }, []);

  return (
    <>
      {corner > 0 && !pathname.startsWith("/admin") && (
        <div key={corner} className={s.corner} aria-hidden>
          <Signature seconds={1.5} />
        </div>
      )}
      {big && (
        <div key={big.n} className={s.big} role="status">
          <Signature seconds={1.9} delay={0.15} />
          <p>{big.text}</p>
        </div>
      )}
    </>
  );
}

/** Para el editor: Cali firma lo que acaba de publicar. */
export function sign(text: string) {
  window.dispatchEvent(new CustomEvent("firma", { detail: text }));
}
