import Link from "next/link";
import styles from "./Placeholder.module.scss";

type Props = {
  eyebrow?: string;
  title: string;
  lead?: string;
  links?: { href: string; label: string }[];
};

/** Temporary page shell until branch 5 (design) replaces each route. */
export function Placeholder({ eyebrow = "En construcción", title, lead, links }: Props) {
  return (
    <main className={styles.root}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.title}>{title}</h1>
      {lead ? <p className={styles.lead}>{lead}</p> : null}
      {links?.length ? (
        <ul className={styles.list}>
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
