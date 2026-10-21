import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate: no session cookie → login. API routes must still verify
// the session themselves.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|zxing/).*)"],
};
