import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Biografía" };

export default function Page() {
  return <Placeholder title="Biografía" lead="Una vida dedicada a transformar ideas, símbolos y emociones en arte." />;
}
