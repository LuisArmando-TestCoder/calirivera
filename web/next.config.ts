import type { NextConfig } from "next";
import { LEGACY_COLLECTION_SLUGS } from "./src/lib/routes";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // De qué commit se construyó este sitio (Netlify: COMMIT_REF). El editor lo usa para saber si una
  // publicación ya está en línea.
  env: { NEXT_PUBLIC_BUILD_COMMIT: process.env.COMMIT_REF ?? "" },
  partialPrefetching: true,
  // Local JSON fallback snapshot must ship with the server functions.
  outputFileTracingIncludes: { "/**": [".content/**/*.json"] },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
  sassOptions: { silenceDeprecations: ["legacy-js-api"] },
  async redirects() {
    // Old Hostinger collection URLs → /colecciones/<slug>. Branch 8 adds the legacy (hacked-site) map.
    return [
      ...LEGACY_COLLECTION_SLUGS.map((slug) => ({
        source: `/${slug}`,
        destination: `/colecciones/${slug}`,
        permanent: true,
      })),
      // Las notas de prensa vivían bajo Trayectoria; ahora «Puntos de vista» es su propia sección.
      { source: "/trayectoria-and-entrevistas/:slug", destination: "/puntos-de-vista/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
