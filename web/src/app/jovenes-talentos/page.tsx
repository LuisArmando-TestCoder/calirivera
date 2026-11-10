import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Jóvenes Talentos" };

export default function Page() {
  return <Placeholder title="Jóvenes Talentos" lead="Viernes de música, danza y performance." />;
}
