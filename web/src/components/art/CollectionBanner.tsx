import Link from "next/link";
import { EditableText } from "@/components/cms/editable";
import { ArtImage } from "@/components/media/ArtImage";
import type { Collection } from "@/lib/content/types";
import s from "./CollectionBanner.module.scss";

/** Una colección como estandarte: imagen arriba, nombre en la tela, periodo en la cola. */
export function CollectionBanner({ c, index, priority = false }: { c: Collection; index: number; priority?: boolean }) {
  const tones = ["anil", "azul", "ocre", "hilo"] as const;
  // el color sigue el orden, salvo donde el nombre manda: «Sueños en Azul» va en azul (y las Musas del
  // Cántaro, que tenían ese azul, toman el ocre del barro)
  const fixed: Record<string, (typeof tones)[number]> = { "suenos-en-azul": "azul", "musas-del-cantaro": "ocre" };
  const tone = fixed[c.slug] ?? tones[index % tones.length];
  return (
    <Link href={`/colecciones/${c.slug}`} className={`${s.banner} ${s[tone]}`} style={{ "--drop": (index % 3) } as React.CSSProperties}>
      <span className={s.cloth}>
        {c.cover && (
          <span className={s.media}>
            <ArtImage image={c.cover} path={`collections/${c.id}#cover`} sizes="(min-width: 60em) 22vw, 70vw" fit="cover" frame={false} priority={priority} />
          </span>
        )}
        <EditableText path={`collections/${c.id}#title`} value={c.title} className={s.title} />
        {c.period && <span className={s.period}>{c.period}</span>}
      </span>
    </Link>
  );
}
