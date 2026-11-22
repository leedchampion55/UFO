import { prisma } from "./prisma";

export async function postingEligibility(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { memberProfile: true } });
  if (!user?.memberProfile || user.role !== "member") return { allowed: false, reason: "MEMBER_REQUIRED" as const };
  if (!user.emailVerified) return { allowed: false, reason: "EMAIL_VERIFICATION_REQUIRED" as const, profile: user.memberProfile };
  if (user.memberProfile.suspendedAt) return { allowed: false, reason: "MEMBER_SUSPENDED" as const, profile: user.memberProfile };
  return { allowed: true, reason: null, profile: user.memberProfile };
}
