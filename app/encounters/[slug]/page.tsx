import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncounterCard } from "@/components/EncounterCard";
import { prisma } from "@/lib/prisma";
import { encounterCardData } from "@/lib/public-encounters";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const encounter = await prisma.encounter.findFirst({ where: { slug, status: "PUBLISHED", deletedAt: null }, select: { title: true, summary: true } });
  return { title: encounter?.title ?? "Case not found", description: encounter?.summary ?? undefined };
}

export default async function EncounterDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const encounter = await prisma.encounter.findFirst({
    where: { slug, status: "PUBLISHED", publishedAt: { not: null }, deletedAt: null },
    include: { category: true, media: { where: { approvedAt: { not: null }, removedAt: null }, orderBy: { uploadedAt: "asc" } } },
  });
  if (!encounter) notFound();
  const related = await prisma.encounter.findMany({ where: { id: { not: encounter.id }, status: "PUBLISHED", categoryId: encounter.categoryId, founderFile: encounter.founderFile, deletedAt: null }, include: { category: true }, orderBy: { publishedAt: "desc" }, take: 2 });
  const attribution = encounter.publishAnonymously || !encounter.publicDisplayName ? "Anonymous contributor" : encounter.publicDisplayName;
  return <main className="case-page"><section className="case-hero"><Image src={encounter.category.imagePath ?? "/category-cornish.webp"} alt={`Illustrative category artwork for ${encounter.category.name}; not encounter evidence`} fill priority /><div className="case-hero-shade" /><div className="container case-hero-copy"><p className="eyebrow">Case file {encounter.caseReference}</p><h1>{encounter.title}</h1></div></section><section className="case-content"><div className="container case-layout"><aside className="case-facts" aria-label="Case facts"><p className="case-tab">Archive details</p><dl><div><dt>Category</dt><dd>{encounter.category.name}</dd></div><div><dt>Approx. location</dt><dd>{encounter.approximateLocation || "Withheld"}</dd></div><div><dt>Encounter date</dt><dd>{encounter.approximateDate ?? encounter.encounterDate?.toLocaleDateString("en-GB") ?? "Not supplied"}</dd></div><div><dt>Contributor</dt><dd>{attribution}</dd></div><div><dt>Published</dt><dd>{encounter.publishedAt!.toLocaleDateString("en-GB")}</dd></div>{encounter.witnessCount && <div><dt>Witnesses</dt><dd>{encounter.witnessCount}</dd></div>}</dl></aside><article className="case-story"><p className="marker case-lead">In the contributor’s words…</p>{encounter.storyContent.split(/\n{2,}/).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<div className="editorial-note"><strong>Editorial note</strong><p>This account is presented as a personal experience. Publication does not claim that any particular explanation has been proven.</p></div></article></div></section>{encounter.media.length > 0 && <section className="section evidence-section"><div className="container"><p className="eyebrow">Contributor material</p><h2>Evidence gallery</h2><p className="section-copy">Approved images supplied with this account. Images are processed to remove embedded metadata before publication.</p><div className="evidence-grid">{encounter.media.map((media) => <figure key={media.id}><div><Image src={`/api/media/${media.id}`} fill alt={media.alternativeText ?? "Contributor-supplied encounter image"} unoptimized /></div>{media.caption && <figcaption>{media.caption}</figcaption>}</figure>)}</div></div></section>}<section className="discussion-preview section"><div className="container narrow"><p className="eyebrow">Discussion preview</p><h2>Join the conversation later</h2><p>Comments remain a Phase 3 feature. Public member sign-in and discussion posting are not active.</p><button className="button button-outline" type="button" disabled>Comments coming in Phase 3</button></div></section><section className="section related-section"><div className="container"><p className="eyebrow">Keep investigating</p><h2>Related encounters</h2>{related.length ? <div className="encounter-grid two-up">{related.map((item) => <EncounterCard encounter={encounterCardData(item)} key={item.id} />)}</div> : <p className="section-copy">No related published encounters yet.</p>}<Link href="/encounters" className="text-link back-link">Back to all encounters</Link></div></section></main>;
}
