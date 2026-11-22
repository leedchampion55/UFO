import Link from "next/link";
import { AdminLogout } from "@/components/AdminLogout";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { administrator } = await requireAdmin();
  return <div className="mission-shell"><aside className="mission-nav"><Link href="/admin" className="mission-brand"><span>WTU?!</span><small>Mission Control</small></Link><nav><Link href="/admin">Encounter overview</Link><Link href="/admin?status=PENDING">Pending queue</Link><Link href="/admin/new">New case file</Link><Link href="/admin?founder=true">Matt’s Files</Link><Link href="/admin/community">Community</Link><Link href="/admin/security">Security</Link><Link href="/" target="_blank">View public site</Link></nav><div><small>Signed in as</small><strong>{administrator.displayName}</strong><AdminLogout /></div></aside><main className="mission-main">{children}</main></div>;
}
