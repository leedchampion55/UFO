import { redirect } from "next/navigation";
import { AdminMfaChallengeForm } from "@/components/AdminMfaForms";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify Mission Control" };

export default async function AdminMfaVerifyPage() {
  if (await getAdminSession()) redirect("/admin");
  return <main className="admin-login-page"><div className="admin-login-card"><p className="eyebrow">Second signal required</p><h1>Verify clearance</h1><p>Enter the current code from your authenticator, or use one of your offline recovery codes.</p><AdminMfaChallengeForm /></div></main>;
}
