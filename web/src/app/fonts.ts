import localFont from "next/font/local";

/**
 * Display: Anybody (variable wdth 50–150, wght 100–900). Its width axis is the point:
 * condensed like a hanging banner, stretched like cloth pulled tight.
 * Text: Newsreader (variable opsz + wght), a reading serif with real italics.
 * Self-hosted from @fontsource-variable (no network at build time).
 */
export const display = localFont({
  src: [{ path: "../../node_modules/@fontsource-variable/anybody/files/anybody-latin-standard-normal.woff2", style: "normal" }],
  variable: "--font-display-face",
  display: "swap",
  weight: "100 900",
  preload: true,
  adjustFontFallback: "Arial",
  declarations: [{ prop: "font-stretch", value: "50% 150%" }],
});

export const text = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-italic.woff2", style: "italic" },
  ],
  variable: "--font-text-face",
  display: "swap",
  weight: "200 800",
  adjustFontFallback: "Times New Roman",
});
