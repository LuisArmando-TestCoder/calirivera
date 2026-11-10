import type { Metadata, Viewport } from "next";
import { Suspense, ViewTransition } from "react";
import "@/styles/globals.scss";
import { getSettings } from "@/lib/content/repo";
import { VersionSync } from "@/lib/cache/VersionSync";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { MotionRoot } from "@/components/motion/MotionRoot";
import { CmsBoot } from "@/components/cms/overlay/CmsBoot";
import { display, text } from "./fonts";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://calirivera.com"),
    title: { default: `${s.siteName}: ${s.tagline}`, template: `%s · ${s.siteName}` },
    description: "Obra viva y legado artístico desde Costa Rica. Colecciones, catálogos y el Taller del Artista.",
    openGraph: { type: "website", locale: "es_CR", siteName: s.siteName },
  };
}

export const viewport: Viewport = { themeColor: "#e6e9eb", colorScheme: "light" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const s = await getSettings();
  return (
    <html lang="es-CR" className={`${display.variable} ${text.variable}`}>
      <body>
        <a className="skip-link" href="#contenido">Saltar al contenido</a>
        <Header email={s.email} whatsapp={s.whatsapp} />
        <main id="contenido">
          <ViewTransition default="page">{children}</ViewTransition>
        </main>
        <Footer settings={s} />
        <Suspense fallback={null}>
          <MotionRoot />
        </Suspense>
        <VersionSync version={s.contentVersion} />
        <CmsBoot />
      </body>
    </html>
  );
}
