import type { NextConfig } from "next";

const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL;
const productionHttps = process.env.NODE_ENV === "production" && canonicalOrigin?.startsWith("https://");
const allowedServerActionOrigins = canonicalOrigin ? [new URL(canonicalOrigin).host] : ["localhost:3000"];

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: {
      allowedOrigins: allowedServerActionOrigins,
      // The administrator evidence form is a Server Action. Application code
      // separately enforces five files, 10 MB each and a 50 MB aggregate.
      bodySizeLimit: "52mb",
    },
  },
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ...(productionHttps ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
