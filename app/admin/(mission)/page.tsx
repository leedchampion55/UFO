import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function MissionControlPage({ searchParams }: { searchParams: Promise<{ status?: string; founder?: string }> }) {
  const params = await searchParams;
  const validStatuses = ["PENDING", "PUBLISHED", "REJECTED", "NEEDS_INFORMATION", "UNPUBLISHED", "DRAFT"] as const;
  const status = validStatuses.find((value) => value === params.status);
  const where = { deletedAt: null, ...(status ? { status } : {}), ...(params.founder === "true" ? { founderFile: true } : {}) };
  const [pending, published, rejected, recent] = await Promise.all([
    prisma.encounter.count({ where: { status: "PENDING", deletedAt: null } }),
    prisma.encounter.count({ where: { status: "PUBLISHED", deletedAt: null } }),
    prisma.encounter.count({ where: { status: "REJECTED", deletedAt: null } }),
    prisma.encounter.findMany({ where, include: { category: true }, orderBy: { submittedAt: "desc" }, take: 30 }),
  ]);
  return <><header className="mission-heading"><div><p className="eyebrow">Matt’s Mission Control</p><h1>Encounter overview</h1></div><Link className="button" href="/admin/new">New case file</Link></header><section className="mission-stats"><Link href="/admin?status=PENDING"><strong>{pending}</strong><span>Pending</span></Link><Link href="/admin?status=PUBLISHED"><strong>{published}</strong><span>Published</span></Link><Link href="/admin?status=REJECTED"><strong>{rejected}</strong><span>Rejected</span></Link></section><section className="mission-panel"><div className="panel-heading"><h2>{status ? status.replaceAll("_", " ") : params.founder ? "Matt’s Files" : "Recently submitted"}</h2><Link href="/admin">Clear filters</Link></div>{recent.length ? <div className="admin-encounter-list">{recent.map((item) => <Link href={`/admin/encounters/${item.id}`} key={item.id}><span className={`status status-${item.status.toLowerCase()}`}>{item.status.replaceAll("_", " ")}</span><div><strong>{item.title}</strong><small>{item.caseReference} · {item.category.name} · {item.submittedAt.toLocaleDateString("en-GB")}</small></div><b>Review</b></Link>)}</div> : <div className="admin-empty"><h3>No encounters here</h3><p>The queue is clear on this frequency.</p></div>}</section></>;
}
