import { Placeholder } from "@/components/Placeholder/Placeholder";
import { getSettings } from "@/lib/content/repo";
import { ROUTES } from "@/lib/routes";

export default async function Home() {
  const s = await getSettings();
  return (
    <Placeholder
      eyebrow={s.siteName}
      title={s.tagline}
      lead="Sitio nuevo en construcción."
      links={ROUTES.filter((r) => r.href !== "/").map((r) => ({ href: r.href, label: r.label }))}
    />
  );
}
