"use client";
import { useEffect } from "react";
import { pruneCache } from "./client";

/** Mounted once in the root layout: drops localStorage entries from older content versions. */
export function VersionSync({ version }: { version: string }) {
  useEffect(() => {
    pruneCache(version);
  }, [version]);
  return null;
}
