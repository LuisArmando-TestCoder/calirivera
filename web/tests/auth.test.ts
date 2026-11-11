import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCode, generateCode, MAX_ATTEMPTS, newStoredCode } from "@/lib/auth/otp";
import { signSession, verifySession } from "@/lib/auth/session";
import { MemoryStore } from "@/lib/cms/store/memory";

const SECRET = "x".repeat(48);

describe("login codes", () => {
  it("generates 6 digits", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
  it("accepts the right code only, before expiry and attempts", () => {
    const now = 1_000_000;
    const stored = newStoredCode("123456", "arte@calirivera.com", SECRET, now);
    expect(stored.codeHash).not.toContain("123456");
    expect(checkCode(stored, "123 456", "ARTE@calirivera.com", SECRET, now + 1)).toBe("ok");
    expect(checkCode(stored, "654321", "arte@calirivera.com", SECRET, now + 1)).toBe("invalid");
    expect(checkCode(stored, "123456", "otra@calirivera.com", SECRET, now + 1)).toBe("invalid");
    expect(checkCode(stored, "123456", "arte@calirivera.com", SECRET, now + 10 * 60_000)).toBe("expired");
    expect(checkCode({ ...stored, attempts: MAX_ATTEMPTS }, "123456", "arte@calirivera.com", SECRET, now)).toBe("locked");
    expect(checkCode(null, "123456", "arte@calirivera.com", SECRET)).toBe("missing");
  });
});

describe("session cookie", () => {
  it("round-trips for the admin and rejects others / tampering", async () => {
    const t = await signSession("arte@calirivera.com", SECRET);
    expect((await verifySession(t, SECRET, "arte@calirivera.com"))?.email).toBe("arte@calirivera.com");
    expect(await verifySession(t, SECRET, "otro@x.com")).toBeNull();
    expect(await verifySession(t, "y".repeat(48), "arte@calirivera.com")).toBeNull();
    expect(await verifySession(t.slice(0, -2) + "aa", SECRET, "arte@calirivera.com")).toBeNull();
    expect(await verifySession(undefined, SECRET, "arte@calirivera.com")).toBeNull();
    // varios editores: vale cualquiera de la lista, y nadie fuera de ella
    expect((await verifySession(t, SECRET, ["otro@x.com", "arte@calirivera.com"]))?.email).toBe("arte@calirivera.com");
    expect(await verifySession(t, SECRET, ["otro@x.com"])).toBeNull();
    const expired = await signSession("arte@calirivera.com", SECRET, -10);
    expect(await verifySession(expired, SECRET, "arte@calirivera.com")).toBeNull();
  });
});

describe("request + verify flow", () => {
  let store = new MemoryStore();
  let logged = "";
  beforeEach(() => {
    store = new MemoryStore();
    vi.resetModules();
    vi.doMock("@/lib/cms/store", () => ({ getStore: () => store }));
    process.env.SESSION_SECRET = SECRET;
    process.env.ADMIN_EMAIL = "arte@calirivera.com";
    delete process.env.SMTP_HOST;
    vi.spyOn(console, "log").mockImplementation((msg: string) => {
      logged = String(msg);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const lastCode = () => logged.match(/(\d{3}) (\d{3})/)!.slice(1).join("");

  it("same answer for unknown e-mails, and no code stored for them", async () => {
    const { requestCode } = await import("@/lib/auth/codes");
    expect(await requestCode("alguien@gmail.com", "ip-a")).toEqual({ ok: true });
    expect((await store.list("authCodes")).length).toBe(0);
  });

  it("logs in with the e-mailed code, once", async () => {
    const { requestCode, verifyCode } = await import("@/lib/auth/codes");
    expect(await requestCode("Arte@CaliRivera.com", "ip-b")).toEqual({ ok: true });
    const code = lastCode();
    expect((await verifyCode("arte@calirivera.com", "000000" === code ? "111111" : "000000", "ip-b")).ok).toBe(false);
    expect(await verifyCode("arte@calirivera.com", code, "ip-b")).toEqual({ ok: true });
    const reuse = await verifyCode("arte@calirivera.com", code, "ip-b");
    expect(reuse.ok).toBe(false);
  });

  it("locks the code after 5 wrong tries", async () => {
    const { requestCode, verifyCode } = await import("@/lib/auth/codes");
    await requestCode("arte@calirivera.com", "ip-c");
    const code = lastCode();
    const wrong = code === "999999" ? "999998" : "999999";
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await verifyCode("arte@calirivera.com", wrong, "ip-c"));
    expect(results.at(-1)).toMatchObject({ ok: false, reason: "locked" });
    expect((await verifyCode("arte@calirivera.com", code, "ip-c")).ok).toBe(false);
  });

  it("rate-limits code requests per e-mail", async () => {
    const { requestCode } = await import("@/lib/auth/codes");
    const ips = ["1", "2", "3", "4", "5", "6"].map((n) => `ip-email-${n}`);
    const out = [];
    for (const ip of ips) out.push(await requestCode("arte@calirivera.com", ip));
    expect(out.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(out[5].ok).toBe(false);
  });
});
