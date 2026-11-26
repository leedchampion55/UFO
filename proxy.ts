import { NextRequest, NextResponse } from "next/server";
import { isStagingGatewayException, stagingGatewayAllowsRequest, stagingGatewayConfiguration } from "@/lib/staging-gateway";

const STAGING_ROBOTS = "noindex, nofollow, noarchive";

function stagingBlockedResponse(configurationState: "invalid" | "enabled") {
  const response = new NextResponse(configurationState === "invalid" ? "Staging access is unavailable." : "Staging authentication required.", {
    status: configurationState === "invalid" ? 503 : 401,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": STAGING_ROBOTS },
  });
  if (configurationState === "enabled") response.headers.set("WWW-Authenticate", 'Basic realm="What the UFO staging", charset="UTF-8"');
  return response;
}

function isPrefetch(request: NextRequest) {
  return request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
}

function needsContentSecurityPolicy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  return !isPrefetch(request)
    && !pathname.startsWith("/api/")
    && !pathname.startsWith("/_next/static/")
    && !pathname.startsWith("/_next/image/")
    && pathname !== "/favicon.ico";
}

export function proxy(request: NextRequest) {
  const gateway = stagingGatewayConfiguration();
  const staging = gateway.state !== "disabled";
  if (staging && !isStagingGatewayException(request.method, request.nextUrl.pathname)) {
    if (gateway.state === "invalid") return stagingBlockedResponse("invalid");
    if (!stagingGatewayAllowsRequest(request.headers.get("authorization"), gateway)) return stagingBlockedResponse("enabled");
  }

  if (!needsContentSecurityPolicy(request)) {
    const response = NextResponse.next();
    if (staging) response.headers.set("X-Robots-Tag", STAGING_ROBOTS);
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV !== "production";
  const productionHttps = !development && process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(productionHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  if (staging) response.headers.set("X-Robots-Tag", STAGING_ROBOTS);
  return response;
}

export const config = {
  matcher: "/:path*",
};
