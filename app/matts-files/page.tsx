import type { Metadata } from "next";
import Link from "next/link";
import { EncounterCard } from "@/components/EncounterCard";
import { PageHero } from "@/components/PageHero";
import { prisma } from "@/lib/prisma";
import { encounterCardData } from "@/lib/public-encounters";

export const metadata: Metadata = { title: "Matt’s Files" };
export const dynamic = "force-dynamic";

export default async function MattsFilesPage() {
  const files = await prisma.encounter.findMany({ where: { founderFile: true, status: "PUBLISHED", publishedAt: { not: null }, deletedAt: null }, include: { category: true }, orderBy: { publishedAt: "desc" } });
  return <main><PageHero eyebrow="The founder’s archive" title="Matt’s Files" copy="Founder Matt James’s own experiences, published here in his words when he is ready to share them." /><section className="matts-archive"><div className="container archive-desk"><aside className="founder-photo"><div className="archive-emblem" role="img" aria-label="Temporary What the UFO founder archive emblem"><span className="emblem-orbit" aria-hidden="true" /><strong>WTU</strong><small>Founder Archive</small></div><p>Matt James · Founder</p></aside><article className="founder-letter"><p className="marker">A note from Matt</p><h2>Personal case files</h2><p>Matt’s full personal introduction has not yet been supplied. Published entries will appear below without inventing biography or experiences on his behalf.</p><p>Each account is created and approved directly through Mission Control.</p><div className="signature-line">More from Matt when the files are ready</div></article><div className="file-drawer"><div className="drawer-label"><span>Personal case files</span><strong>{files.length} published</strong></div>{files.length ? <div className="encounter-grid">{files.map((file) => <EncounterCard key={file.id} encounter={encounterCardData(file)} />)}</div> : <div className="empty-file matt-empty"><span>MF-000</span><h3>No published files yet</h3><p>Matt’s experiences will appear here once he has supplied and published them.</p></div>}<Link href="/contact" className="ink-link">Contact the project</Link></div></div></section></main>;
}
