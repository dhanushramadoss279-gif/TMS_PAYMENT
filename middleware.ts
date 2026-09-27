import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Paths that must stay reachable with no session at all.
const PUBLIC_PATHS = [
  "/login",
  "/api/auth", // NextAuth's own routes (sign-in, callback, csrf, session, etc.)
  "/api/razorpay/webhook", // Razorpay calls this server-to-server, no user session
  "/favicon.ico",
  "/robots.txt",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/assets")) {
    return NextResponse.next();
  }

  // Everything else needs at least a logged-in session.
  // Route handlers / server components further down (requireActiveSubscription)
  // do the real, DB-backed subscription check — this middleware is a fast
  // first-pass redirect so logged-out users never even reach protected pages.
  if (!req.auth?.user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on everything except Next internals — including static assets and
    // API routes — so the whole site, lesson pages included, is covered.
    "/((?!_next/static|_next/image).*)",
  ],
};
