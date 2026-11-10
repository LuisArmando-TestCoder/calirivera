import "server-only";
import { FirebaseStorageMediaStore } from "./firebase";
import { GitHubMediaStore } from "./github";
import { LocalMediaStore } from "./local";
import type { MediaStore } from "./types";

/** MEDIA_STORE=github|firebase|local. Default: github when GITHUB_TOKEN and GITHUB_REPO are set, else local. */
export function getMediaStore(): MediaStore {
  const choice = process.env.MEDIA_STORE ?? (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO ? "github" : "local");
  switch (choice) {
    case "github":
      return new GitHubMediaStore();
    case "firebase":
      return new FirebaseStorageMediaStore();
    default:
      return new LocalMediaStore();
  }
}
export type { MediaStore, StoredMedia } from "./types";
