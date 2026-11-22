"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { auth, getMemberSession, requireVerifiedMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/security";

export async function updateProfile(formData: FormData) {
  const { profile } = await requireVerifiedMember();
  const data = z.object({ displayName: z.string().trim().max(60).optional(), biography: z.string().trim().max(300).optional() }).parse(Object.fromEntries(formData.entries()));
  await prisma.memberProfile.update({ where: { id: profile.id }, data: { displayName: data.displayName || null, biography: data.biography || null } });
  revalidatePath("/account"); revalidatePath(`/members/${profile.usernameCanonical}`);
}

export async function resendVerification() {
  const member = await getMemberSession();
  if (!member || member.verified) return;
  const requestHeaders = await headers();
  await enforceRateLimit(new Request(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", { headers: requestHeaders }), "account-email", 5, 60 * 60);
  await auth.api.sendVerificationEmail({ body: { email: member.session.user.email, callbackURL: "/account/verified" }, headers: requestHeaders });
  redirect("/account?verification=sent");
}

export async function deleteMemberAccount(formData: FormData) {
  const member = await getMemberSession();
  if (!member) redirect("/sign-in");
  if (formData.get("confirmation") !== member.profile.username) redirect("/account?deletion=confirm");
  const password = z.string().min(12).max(128).parse(formData.get("password"));
  await auth.api.deleteUser({ body: { password }, headers: await headers() });
  redirect("/?account=deleted");
}
