import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Catálogos & Proyectos" };

export default function Page() {
  return <Placeholder title="Catálogos & Proyectos" lead="Catálogos, exposiciones y proyectos." />;
}
