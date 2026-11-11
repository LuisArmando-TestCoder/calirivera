import { NextResponse, type NextRequest } from "next/server";
import { editorEmails, getSecret } from "@/lib/auth/secret";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/** Optimistic gate for /admin (pages and actions re-check the session server-side). */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/admin/entrar" || pathname.startsWith("/admin/entrar/")) return NextResponse.next();
  let session = null;
  try {
    session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, getSecret(), editorEmails());
  } catch {
    // SESSION_SECRET missing in production → nobody is logged in; the login screen explains it.
  }
  if (session) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/entrar";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
