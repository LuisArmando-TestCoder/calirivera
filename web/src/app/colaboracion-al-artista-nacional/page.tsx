import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Colaboración al Artista Nacional" };

export default function Page() {
  return <Placeholder title="Colaboración al Artista Nacional" lead="Artistas, deportistas y causas que el Taller ha acompañado." />;
}
