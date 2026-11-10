// Copies ../content/**/*.json (repo root, written by the extraction branch / CMS export)
// into web/.content so the local-JSON fallback ships with the server bundle.
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const src = path.resolve(process.cwd(), "..", "content");
const dest = path.resolve(process.cwd(), ".content");

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
try {
  await stat(src);
  await cp(src, dest, { recursive: true, filter: (p) => !path.basename(p).startsWith(".") && (path.extname(p) === "" || p.endsWith(".json")) });
  console.log(`[sync-content] ${src} → ${dest}`);
} catch {
  console.log("[sync-content] ../content not found — building with built-in defaults");
}
