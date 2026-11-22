import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { deliverDevelopmentEmail } from "./dev-mail";

export const auth = betterAuth({
  appName: "What the UFO?! Mission Control",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    autoSignIn: false,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      await deliverDevelopmentEmail({ to: user.email, subject: "Reset your What the UFO?! password", kind: "PASSWORD_RESET", actionUrl: url });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      await deliverDevelopmentEmail({ to: user.email, subject: "Verify your What the UFO?! membership", kind: "EMAIL_VERIFICATION", actionUrl: url });
    },
  },
  user: { deleteUser: { enabled: true } },
  plugins: [admin({ defaultRole: "member", adminRoles: ["admin"] })],
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

export async function getMemberSession(requestHeaders?: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders ?? await headers() });
  if (!session?.user || session.user.role !== "member") return null;
  const profile = await prisma.memberProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) return null;
  return { session, profile, verified: session.user.emailVerified, suspended: Boolean(profile.suspendedAt) };
}

export async function requireVerifiedMember() {
  const member = await getMemberSession();
  if (!member) redirect("/sign-in");
  if (!member.verified) redirect("/account?verification=required");
  if (member.suspended) redirect("/account?suspended=true");
  return member;
}
