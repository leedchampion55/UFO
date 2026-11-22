import { redirect } from "next/navigation";
import { AdminMfaChallengeForm } from "@/components/AdminMfaForms";
import { getAdminSession } from "@/lib/auth";
import { safeInternalPath } from "@/lib/redirects";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm Mission Control Action" };

export default async function AdminMfaStepUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!admin.mfaEnabled) redirect("/admin/mfa/setup");
  const query = await searchParams;
  return <main className="admin-login-page"><div className="admin-login-card"><p className="eyebrow">Sensitive operation</p><h1>Confirm it’s you</h1><p>Mission Control asks for a fresh authenticator code before exposing private evidence or making a high-impact change. Clearance lasts ten minutes in this session.</p><AdminMfaChallengeForm destination={safeInternalPath(query.next, "/admin")} /></div></main>;
}
