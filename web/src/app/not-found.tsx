import Link from "next/link";
import s from "./not-found.module.scss";

export default function NotFound() {
  return (
    <section className={s.page}>
      <p className={s.code} aria-hidden>404</p>
      <h1 className={s.title}>Esta página no está</h1>
      <p className={s.lead}>Puede que la dirección venga del sitio anterior. La obra sigue aquí:</p>
      <ul className={s.links}>
        <li><Link href="/">Inicio</Link></li>
        <li><Link href="/colecciones">Colecciones</Link></li>
        <li><Link href="/bitacora">Bitácora</Link></li>
      </ul>
    </section>
  );
}
