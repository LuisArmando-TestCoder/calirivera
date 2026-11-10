export interface StoredMedia {
  /** Public URL or site-relative path. */
  src: string;
  /** True when the file is not live yet (e.g. waiting for a Netlify redeploy). */
  pending?: boolean;
}

export interface MediaStore {
  readonly name: "github" | "firebase" | "local";
  put(relPath: string, data: Buffer, contentType: string): Promise<StoredMedia>;
}
