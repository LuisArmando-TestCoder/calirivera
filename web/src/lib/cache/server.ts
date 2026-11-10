import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import type { CollectionName } from "@/lib/content/types";
import { COLLECTIONS } from "@/lib/content/types";
import { tagFor } from "./tags";

/**
 * Layer 1 (server): `use cache` + cacheTag in src/lib/content/repo.ts.
 * Call after every CMS write.
 *  - mode "action": inside a Server Action → updateTag (read-your-own-writes, the editor sees it at once)
 *  - mode "route": inside a Route Handler → revalidateTag(tag, "max") (stale-while-revalidate)
 * Settings are always invalidated too, because contentVersion is bumped on every write
 * and drives the client cache (layer 2).
 */
export function invalidateContent(collection: CollectionName, slug?: string, mode: "action" | "route" = "action") {
  const tags = [tagFor(collection), tagFor(COLLECTIONS.settings)];
  if (slug) tags.push(tagFor(collection, slug));
  for (const t of tags) {
    if (mode === "action") updateTag(t);
    else revalidateTag(t, "max");
  }
}

/** New monotonic version string for SiteSettings.contentVersion. */
export function nextContentVersion(): string {
  return Date.now().toString(36);
}
