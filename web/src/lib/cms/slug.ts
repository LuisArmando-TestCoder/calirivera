export function slugify(input: string, max = 80): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = slugify(base) || "sin-titulo";
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

/** Accent/case-insensitive normalisation for search. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
