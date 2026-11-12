"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assertAdmin, getSession, HINT_COOKIE, SESSION_COOKIE } from "@/lib/auth/server";
import { audit } from "@/lib/cms/audit";
import { isContentCollection, type ContentCollection } from "@/lib/cms/config";
import { deployInfo } from "@/lib/cms/deploy";
import { listVersions, restoreVersion, type Scope } from "@/lib/cms/versions";
import { isInlineOps, type InlineOp } from "@/lib/cms/ops";
import { withBatch } from "@/lib/cms/store";
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

/** Una acción = una publicación (un commit cuando el sitio se guarda en GitHub). Agrega `commit` y `deploys`. */
async function tx<R extends object>(actor: string, message: string, fn: () => Promise<R>) {
  // «Por:» queda en el commit: el historial de versiones dice quién publicó cada cosa
  const { result, commit, deploys } = await withBatch(`${message}\n\nPor: ${actor}`, fn);
  return { ...result, commit, deploys };
}

export async function saveDocAction(collection: string, id: string | null, data: Record<string, unknown>, intent: SaveIntent) {
  try {
    const s = await assertAdmin();
    return await tx(s.email, `Editor: guardar ${collection}${id ? `/${id}` : ""}`, () => saveDoc(s.email, col(collection), id, data, intent));
  } catch (e) {
    return fail(e);
  }
}

export async function setStatusAction(collection: string, id: string, status: "draft" | "published") {
  try {
    const s = await assertAdmin();
    return await tx(s.email, `Editor: ${status === "published" ? "publicar" : "ocultar"} ${collection}/${id}`, () => setStatus(s.email, col(collection), id, status));
  } catch (e) {
    return fail(e);
  }
}

export async function trashDocAction(collection: string, id: string) {
  try {
    const s = await assertAdmin();
    return await tx(s.email, `Editor: a la papelera ${collection}/${id}`, () => trashDoc(s.email, col(collection), id));
  } catch (e) {
    return fail(e);
  }
}

export async function restoreDocAction(collection: string, id: string) {
  try {
    const s = await assertAdmin();
    return await tx(s.email, `Editor: recuperar ${collection}/${id}`, () => restoreDoc(s.email, col(collection), id));
  } catch (e) {
    return fail(e);
  }
}

export async function purgeDocAction(collection: string, id: string) {
  try {
    const s = await assertAdmin();
    return await tx(s.email, `Editor: borrar del todo ${collection}/${id}`, () => purgeDoc(s.email, col(collection), id));
  } catch (e) {
    return fail(e);
  }
}

export async function revertAction(auditId: string) {
  try {
    const s = await assertAdmin();
    return await tx(s.email, `Editor: deshacer un cambio anterior`, () => revertAudit(s.email, auditId));
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
    const n = ops.length;
    const r = await tx(s.email, `Editor: ${n} cambio${n === 1 ? "" : "s"} en ${pathname}`, () => applyInline(s.email, ops));
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

// ---------- versiones ----------

export async function versionsAction(scope: Scope, cursor: string | null) {
  try {
    await assertAdmin();
    const sc = scope && typeof scope.collection === "string" && typeof scope.id === "string" ? { collection: scope.collection, id: scope.id } : null;
    return { ok: true as const, ...(await listVersions(sc, typeof cursor === "string" ? cursor : null)) };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreVersionAction(versionId: string, mode: "this" | "undo", only?: { collection: string; id: string }) {
  try {
    const s = await assertAdmin();
    if (typeof versionId !== "string" || (mode !== "this" && mode !== "undo")) return { ok: false as const, error: "Pedido inválido" };
    const what = mode === "this" ? "volver a una versión anterior" : "deshacer una publicación";
    return await tx(s.email, `Editor: ${what}${only ? ` (${only.collection}/${only.id})` : ""}`, () => restoreVersion(s.email, versionId, mode, only));
  } catch (e) {
    return fail(e);
  }
}

/** Estado de las publicaciones (commits) que el editor tiene «en camino». */
export async function deployStatusAction(commits: string[]) {
  await assertAdmin();
  return deployInfo(Array.isArray(commits) ? commits.filter((c) => typeof c === "string") : []);
}

export async function logoutAction() {
  const s = await getSession();
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(HINT_COOKIE);
  if (s) await audit({ actor: s.email, action: "logout" });
  redirect("/admin/entrar");
}
