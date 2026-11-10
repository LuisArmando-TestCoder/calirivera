import "server-only";
import { randomUUID } from "node:crypto";
import { getAdminStorage } from "@/lib/firebase/admin";
import type { MediaStore } from "./types";

/** Firebase Storage. New projects need the Blaze plan for a default bucket. */
export class FirebaseStorageMediaStore implements MediaStore {
  readonly name = "firebase" as const;
  async put(relPath: string, data: Buffer, contentType: string) {
    const storage = getAdminStorage();
    if (!storage) throw new Error("Firebase Storage no está configurado");
    const bucket = storage.bucket();
    const token = randomUUID();
    await bucket.file(relPath).save(data, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "public, max-age=31536000, immutable", metadata: { firebaseStorageDownloadTokens: token } },
    });
    return { src: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(relPath)}?alt=media&token=${token}` };
  }
}
