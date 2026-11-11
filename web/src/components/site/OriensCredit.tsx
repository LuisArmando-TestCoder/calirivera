"use client";

import { useEffect, useRef } from "react";
import s from "./OriensCredit.module.scss";

/**
 * El crédito de Oriens.ninja, con un guiño: al pasar por encima (o enfocarlo con el teclado)
 * un Juego de la Vida diminuto, blanco y de un solo tono, cobra vida alrededor del nombre.
 * La primera generación nace de las propias letras; el puntero va sembrando células.
 * Solo corre mientras se mira: al salir se apaga y no queda nada en marcha.
 */
const CELL = 3; // px por célula
const PAD_X = 22;
const PAD_Y = 16;
const STEP_MS = 85;

export function OriensCredit() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const link = linkRef.current;
    const canvas = canvasRef.current;
    if (!link || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cols = 0;
    let rows = 0;
    let a = new Uint8Array(0);
    let b = new Uint8Array(0);
    let raf = 0;
    let last = 0;
    let on = false;

    const paint = () => {
      ctx.clearRect(0, 0, cols, rows);
      ctx.fillStyle = "#fff";
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (a[y * cols + x]) ctx.fillRect(x, y, 1, 1);
    };

    const seed = () => {
      const r = link.getBoundingClientRect();
      cols = Math.ceil((r.width + PAD_X * 2) / CELL);
      rows = Math.ceil((r.height + PAD_Y * 2) / CELL);
      canvas.width = cols;
      canvas.height = rows;
      a = new Uint8Array(cols * rows);
      b = new Uint8Array(cols * rows);
      // las letras del nombre son la primera generación
      const cs = getComputedStyle(link);
      const px = parseFloat(cs.fontSize) / CELL;
      ctx.clearRect(0, 0, cols, rows);
      ctx.font = `${cs.fontWeight} ${px}px ${cs.fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(link.textContent ?? "", PAD_X / CELL, rows / 2);
      const img = ctx.getImageData(0, 0, cols, rows).data;
      for (let i = 0; i < a.length; i++) a[i] = img[i * 4 + 3] > 90 ? 1 : 0;
      // y un poco de azar alrededor para que no se apague enseguida
      for (let i = 0; i < a.length; i++) if (Math.random() < 0.07) a[i] = 1;
      paint();
    };

    const step = () => {
      for (let y = 0; y < rows; y++) {
        const up = ((y + rows - 1) % rows) * cols;
        const mid = y * cols;
        const dn = ((y + 1) % rows) * cols;
        for (let x = 0; x < cols; x++) {
          const l = (x + cols - 1) % cols;
          const r = (x + 1) % cols;
          const n = a[up + l] + a[up + x] + a[up + r] + a[mid + l] + a[mid + r] + a[dn + l] + a[dn + x] + a[dn + r];
          b[mid + x] = n === 3 || (n === 2 && a[mid + x]) ? 1 : 0;
        }
      }
      [a, b] = [b, a];
    };

    const loop = (t: number) => {
      if (!on) return;
      if (t - last >= STEP_MS) {
        last = t;
        step();
        paint();
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      if (on) return;
      on = true;
      seed();
      link.dataset.life = "on";
      if (!still) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      on = false;
      cancelAnimationFrame(raf);
      delete link.dataset.life;
    };
    // el puntero siembra un pequeño planeador donde pasa
    const sow = (e: PointerEvent) => {
      if (!on || still) return;
      const r = canvas.getBoundingClientRect();
      const cx = Math.floor(((e.clientX - r.left) / r.width) * cols);
      const cy = Math.floor(((e.clientY - r.top) / r.height) * rows);
      for (const [dx, dy] of [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]]) {
        const x = (cx + dx + cols) % cols;
        const y = (cy + dy + rows) % rows;
        a[y * cols + x] = 1;
      }
    };
    const hide = () => document.hidden && stop();

    link.addEventListener("pointerenter", start);
    link.addEventListener("pointerleave", stop);
    link.addEventListener("pointermove", sow);
    link.addEventListener("focus", start);
    link.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hide);
    return () => {
      stop();
      link.removeEventListener("pointerenter", start);
      link.removeEventListener("pointerleave", stop);
      link.removeEventListener("pointermove", sow);
      link.removeEventListener("focus", start);
      link.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  return (
    <a ref={linkRef} href="https://oriens.ninja" target="_blank" rel="noopener" className={s.link}>
      <canvas ref={canvasRef} className={s.life} aria-hidden="true" />
      <span className={s.name}>Oriens.ninja</span>
    </a>
  );
}
