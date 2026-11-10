"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assertAdmin, getSession, HINT_COOKIE, SESSION_COOKIE } from "@/lib/auth/server";
import { audit } from "@/lib/cms/audit";
import { isContentCollection, type ContentCollection } from "@/lib/cms/config";
import { isInlineOps, type InlineOp } from "@/lib/cms/ops";
import {
  applyInline,
  discardInlineDraft,
  loadInlineDraft,
  purgeDoc,
  restoreDoc,
  revertAudit,
  saveDoc,
  saveInlineDraft,
  setStatus,
  trashDoc,
  type SaveIntent,
} from "@/lib/cms/write";

function col(c: string): ContentCollection {
  if (!isContentCollection(c)) throw new Error("Colección inválida");
  return c;
}
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Algo salió mal" });

export async function saveDocAction(collection: string, id: string | null, data: Record<string, unknown>, intent: SaveIntent) {
  try {
    const s = await assertAdmin();
    return await saveDoc(s.email, col(collection), id, data, intent);
  } catch (e) {
    return fail(e);
  }
}

export async function setStatusAction(collection: string, id: string, status: "draft" | "published") {
  try {
    const s = await assertAdmin();
    return await setStatus(s.email, col(collection), id, status);
  } catch (e) {
    return fail(e);
  }
}

export async function trashDocAction(collection: string, id: string) {
  try {
    const s = await assertAdmin();
    return await trashDoc(s.email, col(collection), id);
  } catch (e) {
    return fail(e);
  }
}

export async function restoreDocAction(collection: string, id: string) {
  try {
    const s = await assertAdmin();
    return await restoreDoc(s.email, col(collection), id);
  } catch (e) {
    return fail(e);
  }
}

export async function purgeDocAction(collection: string, id: string) {
  try {
    const s = await assertAdmin();
    return await purgeDoc(s.email, col(collection), id);
  } catch (e) {
    return fail(e);
  }
}

export async function revertAction(auditId: string) {
  try {
    const s = await assertAdmin();
    return await revertAudit(s.email, auditId);
  } catch (e) {
    return fail(e);
  }
}

// ---------- inline editor ----------

export async function whoAmIAction() {
  const s = await getSession();
  if (!s) {
    (await cookies()).delete(HINT_COOKIE);
    return null;
  }
  return { email: s.email };
}

export async function inlinePublishAction(pathname: string, ops: InlineOp[]) {
  try {
    const s = await assertAdmin();
    if (!isInlineOps(ops)) return { ok: false as const, error: "Cambios inválidos" };
    const r = await applyInline(s.email, ops);
    if (r.ok) await discardInlineDraft(pathname);
    return r;
  } catch (e) {
    return fail(e);
  }
}

export async function inlineSaveDraftAction(pathname: string, ops: InlineOp[]) {
  try {
    const s = await assertAdmin();
    if (!isInlineOps(ops)) return { ok: false as const, error: "Cambios inválidos" };
    return await saveInlineDraft(s.email, pathname, ops);
  } catch (e) {
    return fail(e);
  }
}

export async function inlineLoadDraftAction(pathname: string) {
  await assertAdmin();
  return loadInlineDraft(pathname);
}

export async function inlineDiscardDraftAction(pathname: string) {
  await assertAdmin();
  return discardInlineDraft(pathname);
}

export async function logoutAction() {
  const s = await getSession();
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(HINT_COOKIE);
  if (s) await audit({ actor: s.email, action: "logout" });
  redirect("/admin/entrar");
}
