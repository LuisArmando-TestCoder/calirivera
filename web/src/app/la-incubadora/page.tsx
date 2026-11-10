import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "La Incubadora" };

export default function Page() {
  return <Placeholder title="La Incubadora" lead="Jueves de literatura: poetas, escritores y cuentistas." />;
}
