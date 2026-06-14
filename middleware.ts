import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { computeSessionToken } from "./lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") return NextResponse.next();

  const sessionCookie = request.cookies.get("admin_session")?.value;
  const expected = await computeSessionToken(process.env.ADMIN_PASSWORD!);

  if (sessionCookie !== expected) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
