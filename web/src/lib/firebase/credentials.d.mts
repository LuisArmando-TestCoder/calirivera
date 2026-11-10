export declare const SERVICE_ACCOUNT_FILENAME: string;
export declare function serviceAccountCandidates(cwd?: string): string[];
export declare function loadServiceAccount(cwd?: string): {
  credentials: { projectId: string; clientEmail: string; privateKey: string };
  source: string;
} | null;
