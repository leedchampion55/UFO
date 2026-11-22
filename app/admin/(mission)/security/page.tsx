import { RegenerateRecoveryCodesForm } from "@/components/AdminMfaForms";
import { requireStrongAdmin } from "@/lib/auth";

export const metadata = { title: "Mission Control Security" };

export default async function AdminSecurityPage() {
  await requireStrongAdmin("/admin/security");
  return <><header className="mission-heading"><div><p className="eyebrow">Administrator protection</p><h1>Security</h1><p>TOTP multi-factor authentication is active. Mission Control never displays the authenticator secret again.</p></div></header><section className="mission-panel"><h2>Recovery codes</h2><p>Replacing the recovery codes immediately invalidates every previous code. Store the new set offline and never send it by email or chat.</p><RegenerateRecoveryCodesForm /></section></>;
}
