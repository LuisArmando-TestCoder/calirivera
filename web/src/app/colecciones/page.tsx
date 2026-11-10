import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Colecciones" };

export default function Page() {
  return <Placeholder title="Colecciones" lead="Siete colecciones, siete etapas de creación." />;
}
