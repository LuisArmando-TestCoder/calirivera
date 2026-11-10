import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Taller del Artista" };

export default function Page() {
  return <Placeholder title="Taller del Artista" lead="26 años abriendo espacio al arte costarricense." />;
}
