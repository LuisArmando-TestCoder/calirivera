import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Editor", robots: { index: false, follow: false } };

/** CMS entry (branch 4): login by e-mail code for arte@calirivera.com, then inline editing. */
export default function Admin() {
  return <Placeholder eyebrow="Editor" title="Acceso del artista" lead="El editor llega en la rama 4." />;
}
