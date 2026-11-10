import type { Metadata, Viewport } from "next";
import "@/styles/globals.scss";
import { getSettings } from "@/lib/content/repo";
import { VersionSync } from "@/lib/cache/VersionSync";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://calirivera.com"),
    title: { default: `${s.siteName} — ${s.tagline}`, template: `%s · ${s.siteName}` },
    description: "Obra viva y legado artístico desde Costa Rica. Colecciones, catálogos y el Taller del Artista.",
    openGraph: { type: "website", locale: "es_CR", siteName: s.siteName },
  };
}

export const viewport: Viewport = { themeColor: "#f4efe6" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const s = await getSettings();
  return (
    <html lang="es-CR">
      <body>
        {children}
        <VersionSync version={s.contentVersion} />
      </body>
    </html>
  );
}
