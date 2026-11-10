import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Bitácora" };

export default function Page() {
  return <Placeholder title="Bitácora" lead="Eventos y novedades del Taller, de lo más nuevo a lo más viejo." />;
}
