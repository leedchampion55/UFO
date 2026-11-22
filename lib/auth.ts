import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";

export const auth = betterAuth({
  appName: "What the UFO?! Mission Control",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  plugins: [admin()],
  session: {
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
    freshAge: 60 * 30,
  },
  rateLimit: { enabled: false },
  advanced: {
    ipAddress: { disableIpTracking: true },
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    database: { joins: true },
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"],
  telemetry: { enabled: false },
});

export async function getAdminSession(requestHeaders?: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders ?? await headers() });
  if (!session?.user || session.user.role !== "admin") return null;
  const administrator = await prisma.administrator.findUnique({ where: { userId: session.user.id } });
  if (!administrator?.active) return null;
  return { session, administrator };
}

export async function requireAdmin() {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");
  return adminSession;
}
