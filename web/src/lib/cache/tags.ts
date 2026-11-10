import type { CollectionName } from "@/lib/content/types";

/** Cache tag convention: "c:<collection>" and "c:<collection>:<slug>". */
export function tagFor(collection: CollectionName, slug?: string): string {
  return slug ? `c:${collection}:${slug}` : `c:${collection}`;
}
