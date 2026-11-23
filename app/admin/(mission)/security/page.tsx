import { RegenerateRecoveryCodesForm } from "@/components/AdminMfaForms";
import { requireStrongAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Mission Control Security" };

export default async function AdminSecurityPage() {
  await requireStrongAdmin("/admin/security");
  const [counts, failures] = await Promise.all([
    prisma.emailOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.emailOutbox.findMany({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, kind: true, status: true, attemptCount: true, lastErrorCode: true, updatedAt: true } }),
  ]);
  return <><header className="mission-heading"><div><p className="eyebrow">Administrator protection</p><h1>Security</h1><p>TOTP multi-factor authentication is active. Mission Control never displays the authenticator secret again.</p></div></header><section className="mission-panel"><h2>Recovery codes</h2><p>Replacing the recovery codes immediately invalidates every previous code. Store the new set offline and never send it by email or chat.</p><RegenerateRecoveryCodesForm /></section><section className="mission-panel"><h2>Email delivery health</h2><p>Message contents, secure links and recipient addresses are deliberately hidden here.</p><div className="mission-stats">{counts.map((item) => <div key={item.status}><strong>{item._count._all}</strong><span>{item.status.replaceAll("_", " ")}</span></div>)}</div>{failures.length ? <ul className="audit-list">{failures.map((item) => <li key={item.id}><strong>{item.kind.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}</strong><span>{item.updatedAt.toLocaleString("en-GB")} · {item.attemptCount} attempts</span><p>{item.lastErrorCode ?? "No provider error code supplied"}</p></li>)}</ul> : <p>No failed deliveries require attention.</p>}</section></>;
}
