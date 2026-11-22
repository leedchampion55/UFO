import { auth } from "./auth";
import { prisma } from "./prisma";

type RegistrationInput = { email: string; username: string; password: string };
type ProfileCreator = (args: { data: { userId: string; username: string; usernameCanonical: string } }) => Promise<unknown>;

export async function registerMemberAccount(input: RegistrationInput, requestHeaders: Headers, createProfile: ProfileCreator = async (args) => prisma.memberProfile.create(args)) {
  const canonical = input.username.toLowerCase();
  let userId: string | undefined;
  try {
    const result = await auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.username, callbackURL: "/account/verified" },
      headers: requestHeaders,
    });
    userId = result.user.id;
    await createProfile({ data: { userId, username: input.username, usernameCanonical: canonical } });
    await auth.api.sendVerificationEmail({ body: { email: input.email, callbackURL: "/account/verified" }, headers: requestHeaders });
    return { userId };
  } catch (error) {
    if (userId) {
      try {
        await prisma.user.delete({ where: { id: userId } });
      } catch (cleanupError) {
        console.error("Member registration compensation failed", { code: cleanupError instanceof Error ? cleanupError.name : "UNKNOWN" });
      }
    }
    throw error;
  }
}
