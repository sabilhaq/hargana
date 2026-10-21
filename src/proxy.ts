import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate for pages: no session cookie → login. API routes are left
// out and verify the session themselves, answering 401 instead of a redirect.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!api/|login|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|zxing/).*)"],
};
