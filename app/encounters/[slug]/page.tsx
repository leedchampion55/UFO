import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EncounterCard } from "@/components/EncounterCard";
import { encounters } from "@/data/site";

export function generateStaticParams() { return encounters.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const encounter = encounters.find((item) => item.slug === slug);
  return { title: encounter?.title ?? "Case not found" };
}

export default async function EncounterDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const encounter = encounters.find((item) => item.slug === slug);
  if (!encounter) notFound();
  const related = encounters.filter((item) => item.slug !== encounter.slug).slice(0, 2);
  return (
    <main className="case-page">
      <section className="case-hero">
        <Image src={encounter.image} alt={`Illustrative atmospheric scene for ${encounter.category}; not encounter evidence`} fill priority />
        <div className="case-hero-shade" />
        <div className="container case-hero-copy">
          <div className="demo-banner"><strong>Fictional demonstration</strong><span>This is not a genuine encounter report.</span></div>
          <p className="eyebrow">Case file {encounter.caseNumber}</p>
          <h1>{encounter.title}</h1>
        </div>
      </section>
      <section className="case-content">
        <div className="container case-layout">
          <aside className="case-facts" aria-label="Case facts">
            <p className="case-tab">Archive details</p>
            <dl>
              <div><dt>Category</dt><dd>{encounter.category}</dd></div>
              <div><dt>Approx. location</dt><dd>{encounter.location}</dd></div>
              <div><dt>Encounter date</dt><dd>{encounter.date}</dd></div>
              <div><dt>Contributor</dt><dd>Fictional demo witness</dd></div>
            </dl>
          </aside>
          <article className="case-story">
            <p className="marker case-lead">In the witness’s imagined words…</p>
            {encounter.story.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <div className="editorial-note"><strong>Editorial note</strong><p>No verification or assessment has been performed because this is demonstration content for the Phase 1 interface.</p></div>
          </article>
        </div>
      </section>
      <section className="section evidence-section">
        <div className="container">
          <p className="eyebrow">Evidence gallery preview</p>
          <h2>Submitted material</h2>
          <p className="section-copy">These crops reuse the supplied brand artwork to demonstrate a future gallery. They are not evidence.</p>
          <div className="evidence-grid">
            {["75% 25%", "90% 60%", "18% 72%"].map((position, index) => <figure key={position}><div><Image src="/reference-artwork.png" fill alt="Decorative crop of the supplied brand artwork" style={{ objectPosition: position }} /></div><figcaption>Demonstration image {index + 1} · Brand artwork crop</figcaption></figure>)}
          </div>
        </div>
      </section>
      <section className="discussion-preview section">
        <div className="container narrow">
          <p className="eyebrow">Discussion preview</p>
          <h2>Join the conversation later</h2>
          <p>Comments are not active in Phase 1. Once community features launch, anyone may read discussions while posting will require a registered, email-verified account.</p>
          <button className="button button-outline" type="button" disabled>Comments coming in a later phase</button>
        </div>
      </section>
      <section className="section related-section"><div className="container"><p className="eyebrow">Keep investigating</p><h2>Related demonstration files</h2><div className="encounter-grid two-up">{related.map((item) => <EncounterCard encounter={item} key={item.slug} />)}</div><Link href="/encounters" className="text-link back-link">Back to all encounters</Link></div></section>
    </main>
  );
}
