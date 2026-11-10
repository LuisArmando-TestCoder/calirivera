import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Trayectoria & Entrevistas" };

export default function Page() {
  return <Placeholder title="Trayectoria & Entrevistas" lead="Una trayectoria contada a través de obras, símbolos y distintas etapas de creación." />;
}
