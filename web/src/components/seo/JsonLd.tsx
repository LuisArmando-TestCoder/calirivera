import { ldJson } from "@/lib/seo";

/** Datos estructurados de la página (schema.org). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(data) }} />;
}
