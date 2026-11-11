import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

/**
 * Todo el sitio es público y se puede leer, citar e indexar: buscadores y asistentes de IA incluidos
 * (se los nombra para que no quede duda). Solo quedan fuera el editor y las rutas internas.
 */
export default function robots(): MetadataRoute.Robots {
  const closed = ["/admin", "/api/cms"];
  const ai = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot", "Bingbot", "DuckAssistBot", "Meta-ExternalAgent", "Amazonbot", "cohere-ai", "MistralAI-User"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: closed },
      { userAgent: ai, allow: "/", disallow: closed },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
