import { redirect } from "next/navigation";
import { AdminMfaSetupForm } from "@/components/AdminMfaForms";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Secure Mission Control" };

export default async function AdminMfaSetupPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (admin.mfaEnabled) redirect("/admin");
  return <main className="admin-login-page"><div className="admin-login-card mfa-card"><p className="eyebrow">Security upgrade required</p><h1>Protect Mission Control</h1><p>Administrator accounts require an authenticator code. Enrol once, then keep your recovery codes somewhere private and offline.</p><AdminMfaSetupForm /></div></main>;
}
