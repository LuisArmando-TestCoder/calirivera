"use client";
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

/**
 * Mounted once in the root layout. For visitors it renders nothing and loads nothing:
 * the editor bundle is fetched only when the `cr_admin` hint cookie exists, and the
 * overlay then confirms the real (httpOnly) session with the server before showing.
 * Pages stay fully static — no cookies() read on the server.
 */
const EditorOverlay = dynamic(() => import("./EditorOverlay"), { ssr: false });

const subscribe = () => () => {};
const hasHint = () => window.top === window && /(?:^|;\s*)cr_admin=1(?:;|$)/.test(document.cookie);

export function CmsBoot() {
  // No usePathname here: this sits in the root layout and must not make routes dynamic.
  const admin = useSyncExternalStore(subscribe, hasHint, () => false);
  if (!admin) return null;
  return <EditorOverlay />;
}
