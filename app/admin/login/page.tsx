import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { getAdminSession } from "@/lib/auth";

export const metadata = { title: "Mission Control Login" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const admin = await getAdminSession();
  if (admin) redirect(admin.mfaEnabled ? "/admin" : "/admin/mfa/setup");
  return <main className="admin-login-page"><div className="admin-login-card"><p className="eyebrow">Restricted frequency</p><h1>Mission Control</h1><p>Administrator access for Matt and authorised editors only.</p><AdminLoginForm /><p className="login-footnote">There is no public administrator registration route.</p></div></main>;
}
