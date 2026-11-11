import "server-only";
import { getStore } from "./store";
import { GitHubStore } from "./store/github";

/**
 * ¿En qué va una publicación? Cada publicación es un commit; el sitio que está en línea sabe de qué commit
 * se construyó (NEXT_PUBLIC_BUILD_COMMIT, fijado al construir). Una publicación está «en línea» cuando el
 * commit del sitio la contiene.
 *   sent      → el commit existe; Netlify todavía no avisó nada
 *   building  → Netlify está construyendo
 *   live      → el sitio en línea ya la incluye
 *   failed    → la construcción falló (el sitio sigue como estaba; el cambio no se perdió: está en el repo)
 * Opcional: NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID (o SITE_ID) para leer el estado exacto de Netlify.
 */
export type DeployState = "sent" | "building" | "live" | "failed";
export interface DeployInfo {
  /** el almacén publica con despliegue (GitHub) o al instante (Firestore / local) */
  deploys: boolean;
  live: string;
  states: Record<string, DeployState>;
}

export const liveCommit = () => process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "";

async function netlifyStates(): Promise<Map<string, DeployState> | null> {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  const site = process.env.NETLIFY_SITE_ID ?? process.env.SITE_ID;
  if (!token || !site) return null;
  try {
    const r = await fetch(`https://api.netlify.com/api/v1/sites/${site}/deploys?per_page=12`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r.ok) return null;
    const out = new Map<string, DeployState>();
    for (const d of (await r.json()) as { commit_ref?: string; state?: string; context?: string }[]) {
      if (!d.commit_ref || d.context !== "production" || out.has(d.commit_ref)) continue;
      out.set(d.commit_ref, d.state === "ready" ? "live" : d.state === "error" ? "failed" : d.state === "building" || d.state === "processing" || d.state === "uploading" ? "building" : "sent");
    }
    return out;
  } catch {
    return null;
  }
}

export async function deployInfo(commits: string[]): Promise<DeployInfo> {
  const store = getStore();
  const live = liveCommit();
  const states: Record<string, DeployState> = {};
  if (!(store instanceof GitHubStore)) {
    for (const c of commits) states[c] = "live";
    return { deploys: false, live, states };
  }
  const list = commits.filter((c) => /^[0-9a-f]{7,40}$/.test(c)).slice(0, 20);
  const netlify = list.length ? await netlifyStates() : null;
  await Promise.all(
    list.map(async (sha) => {
      if (live && sha === live) return void (states[sha] = "live");
      try {
        if (live) {
          // ¿el commit del sitio en línea ya contiene este?
          const r = await store.api(`/compare/${sha}...${live}`);
          if (r.ok) {
            const j = (await r.json()) as { status?: string };
            if (j.status === "ahead" || j.status === "identical") return void (states[sha] = "live");
          }
        }
        const n = netlify?.get(sha);
        if (n && n !== "live") return void (states[sha] = n);
        // sin token de Netlify: lo que Netlify le cuenta a GitHub (si su app está instalada)
        const s = await store.api(`/commits/${sha}/status`);
        if (s.ok) {
          const j = (await s.json()) as { state?: string; total_count?: number };
          if (j.total_count && (j.state === "failure" || j.state === "error")) return void (states[sha] = "failed");
          if (j.total_count && j.state === "pending") return void (states[sha] = "building");
        }
      } catch {}
      states[sha] = "sent";
    }),
  );
  return { deploys: true, live, states };
}
