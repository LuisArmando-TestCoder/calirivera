/**
 * Título en itálica que aparece centrado sobre la foto al pasar el puntero o enfocar
 * (un solo elemento fijo, por encima del canvas WebGPU). Lee data-label de [data-mem].
 */
export function hoverLabel(root: HTMLElement, label: HTMLElement, opts: { moving?: boolean } = {}) {
  let cur: HTMLElement | null = null;
  let raf = 0;
  const place = () => {
    raf = 0;
    if (!cur || !cur.isConnected || cur.hidden) return hide();
    const f = cur.querySelector<HTMLElement>("[data-gl-frame]") ?? cur;
    const r = f.getBoundingClientRect();
    label.style.transform = `translate3d(${(r.left + r.width / 2).toFixed(1)}px, ${(r.top + r.height / 2).toFixed(1)}px, 0) translate(-50%, -50%)`;
    label.style.maxWidth = `${Math.max(120, r.width * 0.86)}px`;
    if (opts.moving) queue(); // cintas que se mueven solas: seguirlas mientras haya hover
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(place);
  };
  const show = (el: HTMLElement) => {
    const text = el.dataset.label ?? "";
    if (!text) return hide();
    cur = el;
    label.textContent = text;
    label.dataset.on = "";
    place();
  };
  const hide = () => {
    cur = null;
    delete label.dataset.on;
  };
  const over = (e: Event) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-mem]");
    if (el && el !== cur) show(el);
  };
  const out = (e: PointerEvent | FocusEvent) => {
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.("[data-mem]");
    if (!to) hide();
  };
  root.addEventListener("pointerover", over);
  root.addEventListener("pointerout", out);
  root.addEventListener("focusin", over);
  root.addEventListener("focusout", out);
  addEventListener("scroll", queue, { passive: true });
  return () => {
    cancelAnimationFrame(raf);
    root.removeEventListener("pointerover", over);
    root.removeEventListener("pointerout", out);
    root.removeEventListener("focusin", over);
    root.removeEventListener("focusout", out);
    removeEventListener("scroll", queue);
  };
}
