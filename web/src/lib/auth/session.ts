/** Session cookie: HS256 JWT (jose) in an httpOnly cookie + a non-secret hint cookie for the overlay. */
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "cr_session";
/** Readable by JS. Only tells the static pages to lazy-load the editor; never trusted by the server. */
export const HINT_COOKIE = "cr_admin";
export const SESSION_TTL_S = 30 * 24 * 3600;

export interface Session {
  email: string;
  role: "admin";
  iat: number;
  exp: number;
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(email: string, secret: string, ttlS = SESSION_TTL_S): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email.toLowerCase())
    .setIssuedAt()
    .setIssuer("calirivera-cms")
    .setExpirationTime(`${ttlS}s`)
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string, adminEmail: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: "calirivera-cms", algorithms: ["HS256"] });
    if (payload.role !== "admin" || payload.sub?.toLowerCase() !== adminEmail) return null;
    return { email: payload.sub, role: "admin", iat: payload.iat ?? 0, exp: payload.exp ?? 0 };
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge = SESSION_TTL_S) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
