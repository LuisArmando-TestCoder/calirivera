import "server-only";
import { getStore } from "./store";

export type AuditAction = "create" | "update" | "publish" | "unpublish" | "trash" | "restore" | "purge" | "revert" | "inline" | "login" | "logout" | "upload";

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  collection?: string;
  docId?: string;
  title?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  note?: string;
}

/** Time-sortable id: newest first when listed by id desc. */
export function auditId(now = Date.now()): string {
  return `${String(now).padStart(15, "0")}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function audit(entry: Omit<AuditEntry, "id" | "at">): Promise<string> {
  const id = auditId();
  try {
    await getStore().set("auditLog", id, { ...entry, at: new Date().toISOString() });
  } catch (e) {
    console.error("[cms] audit failed", e);
  }
  return id;
}

export async function listAudit(limit = 30, startAfterId?: string): Promise<AuditEntry[]> {
  return (await getStore().list("auditLog", { desc: true, limit, startAfterId })) as unknown as AuditEntry[];
}

export async function getAudit(id: string): Promise<AuditEntry | null> {
  return (await getStore().get("auditLog", id)) as unknown as AuditEntry | null;
}
