import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, twoFactor } from "better-auth/plugins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { deliverDevelopmentEmail } from "./dev-mail";
import { trustedApplicationOrigins } from "./env";
import { safeInternalPath } from "./redirects";

export const STRONG_AUTH_WINDOW_MS = 10 * 60 * 1000;

export const auth = betterAuth({
  appName: "What the UFO?! Mission Control",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql", transaction: true }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    autoSignIn: false,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await deliverDevelopmentEmail({ to: user.email, subject: "Reset your What the UFO?! password", kind: "PASSWORD_RESET", actionUrl: url });
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }) => {
      await deliverDevelopmentEmail({ to: user.email, subject: "Verify your What the UFO?! membership", kind: "EMAIL_VERIFICATION", actionUrl: url });
    },
  },
  user: { deleteUser: { enabled: true } },
  plugins: [
    admin({ defaultRole: "member", adminRoles: ["admin"] }),
    twoFactor({
      issuer: "What the UFO?! Mission Control",
      twoFactorCookieMaxAge: 10 * 60,
      trustDeviceMaxAge: 0,
      accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 15 * 60 },
      backupCodeOptions: { amount: 10, length: 12, storeBackupCodes: "encrypted" },
    }),
  ],
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
  trustedOrigins: trustedApplicationOrigins().length ? trustedApplicationOrigins() : ["http://localhost:3000"],
  telemetry: { enabled: false },
});

export async function getAdminSession(requestHeaders?: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders ?? await headers() });
  if (!session?.user || session.user.role !== "admin") return null;
  const [administrator, persistedSession] = await Promise.all([
    prisma.administrator.findUnique({ where: { userId: session.user.id }, include: { user: { select: { twoFactorEnabled: true } } } }),
    prisma.session.findUnique({ where: { id: session.session.id }, select: { strongAuthAt: true } }),
  ]);
  if (!administrator?.active) {
    await prisma.session.deleteMany({ where: { userId: session.user.id } });
    return null;
  }
  return { session, administrator, mfaEnabled: administrator.user.twoFactorEnabled, strongAuthAt: persistedSession?.strongAuthAt ?? null };
}

export async function requireAdmin() {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");
  if (!adminSession.mfaEnabled) redirect("/admin/mfa/setup");
  return adminSession;
}

export async function requireStrongAdmin(returnTo = "/admin") {
  const adminSession = await requireAdmin();
  if (!adminSession.strongAuthAt || Date.now() - adminSession.strongAuthAt.getTime() > STRONG_AUTH_WINDOW_MS) {
    redirect(`/admin/mfa/step-up?next=${encodeURIComponent(safeInternalPath(returnTo, "/admin"))}`);
  }
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
