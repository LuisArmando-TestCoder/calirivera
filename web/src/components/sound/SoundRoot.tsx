"use client";
import { embedded } from "@/lib/embed";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { _state, fireSet, play, setSound, SOUND_EVENT, soundOn, suspend, unlock, type Sfx } from "./engine";
import { fireNow } from "@/components/fx/fire-bus";
import s from "./sound.module.scss";

/** Cualquier parte del sitio puede pedir un sonido sin importar el motor: sfx("open"). */
export function sfx(name: Sfx) {
  window.dispatchEvent(new CustomEvent("sfx", { detail: name }));
}

/**
 * Montado una vez en el layout. Escucha por delegación (un puñado de listeners pasivos en window):
 *  - pasar por enlaces, botones y fotos → roce;  tocar → golpecito
 *  - eventos "sfx" del sitio (menú, visor, año de Memoria)
 *  - cambio de página → papel
 *  - el fuego: un instrumento que toca lo que hace el fluido, solo donde y cuando se ve (fire-bus)
 */
export function SoundRoot() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) return void (first.current = false);
    play("page");
  }, [pathname]);

  useEffect(() => {
    if (embedded()) return;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __sfx: typeof _state }).__sfx = _state;
    const fine = matchMedia("(pointer: fine)").matches;
    const INTERACTIVE = "a[href], button, [role=button], summary, select, [data-mem]";
    let lastHover: Element | null = null;
    const onDown = (e: PointerEvent) => {
      unlock();
      if ((e.target as Element).closest?.(INTERACTIVE)) play("tap");
    };
    const onKey = (e: KeyboardEvent) => {
      unlock();
      if ((e.key === "Enter" || e.key === " ") && (e.target as Element).closest?.(INTERACTIVE)) play("tap");
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || performance.now() - scrolledAt < 180) return;
      const el = (e.target as Element).closest?.(INTERACTIVE) ?? null;
      if (el && el !== lastHover) play("hover", { rate: el.matches("[data-mem]") ? 0.8 : 1 });
      lastHover = el;
    };
    const onSfx = (e: Event) => play((e as CustomEvent<Sfx>).detail);
    const onVis = () => suspend(document.hidden);

    // El fuego suena solo donde arde y como arde: lo que informan las superficies con fuego (ver fire-bus).
    // Si ninguna informa (no hay fuego en pantalla, o se salió de él), fireNow() da cero y la voz se apaga.
    const loop = window.setInterval(() => fireSet(fireNow()), 66);
    // al hacer scroll, lo que pasa bajo un cursor quieto no es «pasar por encima»: sin roces fantasma
    let scrolledAt = 0;
    const onScroll = () => (scrolledAt = performance.now());
    addEventListener("scroll", onScroll, { passive: true });

    addEventListener("pointerdown", onDown, { passive: true });
    addEventListener("keydown", onKey);
    addEventListener("sfx", onSfx);
    document.addEventListener("visibilitychange", onVis);
    if (fine) {
      addEventListener("pointerover", onOver, { passive: true });
    }
    return () => {
      clearInterval(loop);
      removeEventListener("pointerdown", onDown);
      removeEventListener("keydown", onKey);
      removeEventListener("sfx", onSfx);
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("pointerover", onOver);
      removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}

const subscribe = (cb: () => void) => {
  addEventListener(SOUND_EVENT, cb);
  return () => removeEventListener(SOUND_EVENT, cb);
};

/** Botón de sonido (cabecera): se llega con el teclado, recuerda la elección. */
export function SoundToggle() {
  const on = useSyncExternalStore(subscribe, soundOn, () => true);
  return (
    <button
      type="button"
      className={s.toggle}
      aria-pressed={on}
      aria-label={on ? "Sonido encendido. Apagar" : "Sonido apagado. Encender"}
      title={on ? "Apagar el sonido" : "Encender el sonido"}
      onClick={() => {
        unlock();
        setSound(!on);
        if (!on) setTimeout(() => play("bloom"), 60);
      }}
    >
      <span className={s.bars} data-on={on ? "" : undefined} aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
