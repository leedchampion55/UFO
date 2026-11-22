"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { auth, getMemberSession, requireVerifiedMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function updateProfile(formData: FormData) {
  const { profile } = await requireVerifiedMember();
  const data = z.object({ displayName: z.string().trim().max(60).optional(), biography: z.string().trim().max(300).optional() }).parse(Object.fromEntries(formData.entries()));
  await prisma.memberProfile.update({ where: { id: profile.id }, data: { displayName: data.displayName || null, biography: data.biography || null } });
  revalidatePath("/account"); revalidatePath(`/members/${profile.usernameCanonical}`);
}

export async function resendVerification() {
  const member = await getMemberSession();
  if (!member || member.verified) return;
  await auth.api.sendVerificationEmail({ body: { email: member.session.user.email, callbackURL: "/account/verified" }, headers: await headers() });
  redirect("/account?verification=sent");
}

export async function deleteMemberAccount(formData: FormData) {
  const member = await getMemberSession();
  if (!member) redirect("/sign-in");
  if (formData.get("confirmation") !== member.profile.username) redirect("/account?deletion=confirm");
  await prisma.user.delete({ where: { id: member.session.user.id } });
  redirect("/?account=deleted");
}
