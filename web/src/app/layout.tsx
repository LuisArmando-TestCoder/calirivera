import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@/styles/globals.scss";
import { getSettings, listCollections, listPages } from "@/lib/content/repo";
import { VersionSync } from "@/lib/cache/VersionSync";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { MotionRoot } from "@/components/motion/MotionRoot";
import { PageTransition, ScrollReset } from "@/components/motion/RouteEffects";
import { PdfReaderRoot } from "@/components/pdf/PdfReaderRoot";
import { SignatureMoments } from "@/components/brand/SignatureMoments";
import { HeadingFit } from "@/components/fx/HeadingFit";
import { TitlePlay } from "@/components/fx/TitlePlay";
import { JsonLd } from "@/components/seo/JsonLd";
import { siteGraph } from "@/lib/seo";
import { SoundRoot } from "@/components/sound/SoundRoot";
import { CmsBoot } from "@/components/cms/overlay/CmsBoot";
import { display, read, text, title } from "./fonts";

export async function generateMetadata(): Promise<Metadata> {
  const [s, c] = await Promise.all([getSettings(), listCollections()]);
  const og = c.find((x) => x.slug === "detras-de-la-ventana")?.cover?.src ?? c.find((x) => x.cover)?.cover?.src;
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://calirivera.com"),
    title: { default: `${s.siteName}: ${s.tagline}`, template: `%s · ${s.siteName}` },
    description: "Cali Rivera, artista multidisciplinario costarricense: pintura, arte textil e instalación. Colecciones, catálogos, trayectoria y el Taller del Artista en Tres Ríos, Costa Rica.",
    applicationName: s.siteName,
    authors: [{ name: "Cali Rivera", url: "/biografia" }],
    creator: "Cali Rivera",
    keywords: ["Cali Rivera", "artista costarricense", "arte contemporáneo Costa Rica", "pintura", "arte textil", "Taller del Artista", "Tres Ríos", ...c.map((x) => x.title)],
    // cada página se declara a sí misma como la versión oficial de su dirección
    alternates: { canonical: "./", types: { "text/plain": [{ url: "/llms.txt", title: "Resumen del sitio para asistentes de IA" }] } },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: { type: "website", locale: "es_CR", siteName: s.siteName, url: "./", ...(og ? { images: [{ url: og, alt: "Obra de Cali Rivera" }] } : {}) },
    twitter: { card: "summary_large_image", ...(og ? { images: [og] } : {}) },
  };
}

export const viewport: Viewport = { themeColor: "#e6e9eb", colorScheme: "light" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [s, pages, cols] = await Promise.all([getSettings(), listPages(), listCollections()]);
  // Vista previa del menú: una obra que representa cada página (portadas de colecciones, la más liviana)
  const extra = pages
    .filter((p) => p.menu === "obra" || p.menu === "taller")
    .map((p) => ({ href: `/${p.slug}`, label: p.title, group: p.menu as "obra" | "taller" }));
  return (
    <html lang="es-CR" className={`${display.variable} ${text.variable} ${read.variable} ${title.variable}`}>
      <body>
        <a className="skip-link" href="#contenido">Saltar al contenido</a>
        <Header email={s.email} whatsapp={s.whatsapp} extra={extra} />
        <main id="contenido">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer settings={s} />
        <Suspense fallback={null}>
          <MotionRoot />
          <ScrollReset />
          <PdfReaderRoot />
          <SoundRoot />
          <HeadingFit />
          <TitlePlay />
          <SignatureMoments />
        </Suspense>
        <VersionSync version={s.contentVersion} />
        <CmsBoot />
        <JsonLd data={siteGraph(s, cols.find((x) => x.slug === "detras-de-la-ventana")?.cover?.src)} />
      </body>
    </html>
  );
}
