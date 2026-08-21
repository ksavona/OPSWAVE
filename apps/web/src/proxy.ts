import { type NextRequest, NextResponse } from "next/server";

const developmentCookieName = "opsweave_session";
const productionCookieName = "__Host-opsweave_session";

export function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has(developmentCookieName) || request.cookies.has(productionCookieName);
  if (!hasSession) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/intake/:path*", "/settings/:path*"],
};
