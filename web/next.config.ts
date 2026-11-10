import type { NextConfig } from "next";
import { LEGACY_COLLECTION_SLUGS } from "./src/lib/routes";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
    return LEGACY_COLLECTION_SLUGS.map((slug) => ({
      source: `/${slug}`,
      destination: `/colecciones/${slug}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
