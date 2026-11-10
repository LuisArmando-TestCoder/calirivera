import type { Metadata } from "next";
import { Placeholder } from "@/components/Placeholder/Placeholder";

export const metadata: Metadata = { title: "Manifiesto" };

export default function Page() {
  return <Placeholder title="Manifiesto" lead="El arte es para ser libres." />;
}
