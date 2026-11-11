/**
 * pdf.js (pdfjs-dist 6.5.438, vendorizado en /public/vendor/pdfjs) cargado a demanda: nada de esto pesa
 * hasta que alguien abre un PDF. Las páginas llegan por rangos HTTP (no hace falta bajar los 24 MB de un catálogo
 * para ver la portada).
 */
type PdfJs = typeof import("./pdfjs-types");
export type PdfDoc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;
export type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>;

const BASE = "/vendor/pdfjs/";
let lib: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  lib ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}pdf.min.mjs`) as Promise<PdfJs>).then((m) => {
    m.GlobalWorkerOptions.workerSrc = `${BASE}pdf.worker.min.mjs`;
    return m;
  });
  return lib;
}

export async function openPdf(url: string, onProgress?: (p: number) => void) {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    url,
    cMapUrl: `${BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE}standard_fonts/`,
    wasmUrl: `${BASE}wasm/`,
    disableAutoFetch: true, // solo lo que se mira
    isEvalSupported: false,
  });
  if (onProgress) task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => total && onProgress(Math.min(1, loaded / total));
  return { task, doc: task.promise };
}

export const isPdfHref = (href: string | null | undefined) => !!href && /\.pdf($|[?#])/i.test(href);
