import { Placeholder } from "@/components/Placeholder/Placeholder";

export default function NotFound() {
  return <Placeholder eyebrow="404" title="Esta página se perdió" lead="Pero la obra sigue viva." links={[{ href: "/", label: "Volver al inicio" }]} />;
}
