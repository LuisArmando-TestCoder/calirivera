/** Global styles injected only while the admin is editing a public page. */
export const EDIT_CSS = `
/* Room for the fixed edit bar so the last items stay reachable. */
html.cms-editing body { padding-bottom: calc(190px + env(safe-area-inset-bottom)) !important; }
html.cms-editing [data-cms-kind="text"],
html.cms-editing [data-cms-kind="richtext"] {
  outline: 2px dashed oklch(0.55 0.14 258 / 0.55);
  outline-offset: 4px;
  border-radius: 2px;
  cursor: text;
  transition: outline-color .15s, background-color .15s;
  -webkit-user-modify: read-write-plaintext-only;
  min-width: 1ch;
}
html.cms-editing [data-cms-kind="text"]:empty::before,
html.cms-editing [data-cms-kind="richtext"]:empty::before { content: "Escribí aquí…"; opacity: .45; }
html.cms-editing [data-cms-kind="text"]:hover,
html.cms-editing [data-cms-kind="richtext"]:hover { outline-color: oklch(0.55 0.14 258); }
html.cms-editing [data-cms-kind="text"]:focus,
html.cms-editing [data-cms-kind="richtext"]:focus {
  outline: 3px solid oklch(0.55 0.14 258);
  background-color: oklch(0.97 0.02 258 / 0.6);
}
html.cms-editing [data-cms-kind="image"] {
  outline: 3px dashed oklch(0.55 0.14 258 / 0.7);
  outline-offset: -3px;
  cursor: pointer;
}
html.cms-editing [data-cms-kind="image"]:hover,
html.cms-editing [data-cms-kind="image"]:focus-visible { outline-style: solid; filter: brightness(.92); }
html.cms-editing [data-cms-kind="list"] { outline: 1px dotted oklch(0.55 0.14 258 / 0.4); outline-offset: 8px; }
html.cms-editing [data-cms-new] { box-shadow: 0 0 0 3px oklch(0.6 0.15 150 / .7); }
html.cms-editing [data-cms-placeholder] {
  padding: 16px; border: 2px dashed oklch(0.6 0.15 150); border-radius: 10px; font: 600 16px/1.3 system-ui, sans-serif;
}
[data-cms-ui="add"] { display: flex; justify-content: center; margin: 14px 0 22px; }
[data-cms-ui] { font: 600 16px/1 ui-sans-serif, system-ui, -apple-system, sans-serif; letter-spacing: normal; text-transform: none; }
.cms-add {
  all: unset; box-sizing: border-box; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: .4em;
  min-height: 52px; padding: 0 22px; border-radius: 999px;
  background: oklch(0.5 0.14 258); color: #fff; font: 700 17px/1 ui-sans-serif, system-ui, sans-serif;
  box-shadow: 0 6px 20px oklch(0.5 0.14 258 / .35);
}
.cms-add:focus-visible { outline: 3px solid #fff; box-shadow: 0 0 0 6px oklch(0.5 0.14 258); }
.cms-tools {
  /* In-flow (not absolute) so toolbars of short items never overlap their neighbours. */
  position: relative; z-index: 30; display: flex; gap: 2px; width: max-content; margin: 0 0 4px auto;
  padding: 3px; border-radius: 999px; background: rgb(20 18 15 / .82);
}
.cms-tools button {
  all: unset; box-sizing: border-box; cursor: pointer; width: 38px; height: 38px; border-radius: 50%;
  display: grid; place-items: center; color: #fff; font: 700 18px/1 system-ui, sans-serif;
}
.cms-tools button:hover { background: rgb(255 255 255 / .16); }
.cms-tools button:focus-visible { outline: 2px solid #fff; }
.cms-tools button:disabled { opacity: .3; cursor: default; }
.cms-tools button[data-act="del"] { color: #ffb4ab; }
@media (prefers-reduced-motion: reduce) { html.cms-editing * { transition: none !important; } }
`;
