import { NextResponse, type NextRequest } from "next/server";
import { clientKey, getSession } from "@/lib/auth/server";
import { rateLimit, retryText } from "@/lib/cms/rateLimit";
import { fold } from "@/lib/cms/slug";
import { listArtworks, listCatalogs, listCollections, listPeople, listPosts } from "@/lib/content/repo";

/**
 * Public search + pagination for long lists (Bitácora, personas, obras…).
 * GET /api/public/search?c=posts&q=poesía&page=2&per=12[&program=incubadora]
 * Rate-limited per client (burst + ~2000 Firestore-backed reads per day); the admin is exempt.
 */
const SOURCES = {
  posts: { load: () => listPosts(), text: (d: Record<string, unknown>) => [d.title, d.excerpt, (d.tags as string[] | undefined)?.join(" ")] },
  people: { load: () => listPeople(), text: (d: Record<string, unknown>) => [d.name, d.discipline, d.bio, d.achievement] },
  artworks: { load: () => listArtworks(), text: (d: Record<string, unknown>) => [d.title, d.technique, d.year] },
  collections: { load: () => listCollections(), text: (d: Record<string, unknown>) => [d.title, d.period, d.statement] },
  catalogs: { load: () => listCatalogs(), text: (d: Record<string, unknown>) => [d.title, d.summary, d.year] },
} as const;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const c = sp.get("c") as keyof typeof SOURCES | null;
  if (!c || !(c in SOURCES)) return NextResponse.json({ error: "Colección inválida" }, { status: 400 });

  if (!(await getSession())) {
    const key = await clientKey();
    const burst = await rateLimit("publicBurst", key);
    const daily = burst.allowed ? await rateLimit("publicDailyReads", `${key}_${new Date().toISOString().slice(0, 10)}`) : burst;
    if (!burst.allowed || !daily.allowed) {
      const retry = Math.ceil((burst.allowed ? daily : burst).retryAfterMs / 1000);
      return NextResponse.json(
        { error: `Demasiadas consultas. Probá de nuevo ${retryText(retry * 1000)}.` },
        { status: 429, headers: { "Retry-After": String(retry) } },
      );
    }
  }

  const q = fold((sp.get("q") ?? "").trim().slice(0, 100));
  const per = Math.min(Math.max(Number(sp.get("per")) || 12, 1), 48);
  const program = sp.get("program");
  const src = SOURCES[c];
  let items = (await src.load()) as unknown as Record<string, unknown>[];
  if (program) items = items.filter((d) => d.programKind === program || (Array.isArray(d.programKinds) && d.programKinds.includes(program)));
  if (q) items = items.filter((d) => fold(src.text(d).filter(Boolean).join(" ")).includes(q));
  const pages = Math.max(1, Math.ceil(items.length / per));
  const page = Math.min(Math.max(Number(sp.get("page")) || 1, 1), pages);
  return NextResponse.json(
    { items: items.slice((page - 1) * per, page * per), total: items.length, page, pages, per },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } },
  );
}
