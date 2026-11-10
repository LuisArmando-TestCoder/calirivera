import "server-only";
import type { MediaStore } from "./types";

/**
 * Commits the optimized image to the repo (web/public/media/...). Netlify redeploys
 * on push, so the file is live in ~1–3 minutes. $0, versioned, no extra service.
 * Env: GITHUB_TOKEN (fine-grained, Contents: read & write on this repo only),
 *      GITHUB_REPO ("owner/name"), GITHUB_BRANCH (default "main"),
 *      GITHUB_PUBLIC_DIR (default "web/public").
 */
export class GitHubMediaStore implements MediaStore {
  readonly name = "github" as const;
  constructor(
    private token = process.env.GITHUB_TOKEN ?? "",
    private repo = process.env.GITHUB_REPO ?? "",
    private branch = process.env.GITHUB_BRANCH ?? "main",
    private publicDir = (process.env.GITHUB_PUBLIC_DIR ?? "web/public").replace(/\/+$/, ""),
  ) {
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("GitHubMediaStore: faltan GITHUB_TOKEN o GITHUB_REPO");
  }

  async put(relPath: string, data: Buffer) {
    const path = `${this.publicDir}/${relPath}`.replace(/\/+/g, "/");
    const url = `https://api.github.com/repos/${this.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `cms: subir ${relPath}`,
        content: data.toString("base64"),
        branch: this.branch,
        committer: { name: "Editor calirivera.com", email: "arte@calirivera.com" },
      }),
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { src: `/${relPath}`, pending: true };
  }
}
