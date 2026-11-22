import Image from "next/image";
import Link from "next/link";
import { EncounterCard } from "@/components/EncounterCard";
import { SectionHeading } from "@/components/SectionHeading";
import { discussions, encounters } from "@/data/site";

const unknowns = [
  ["UFOs & UAPs", "Silent lights, impossible movements and things in the sky that refuse an easy answer.", "/category-ufo.webp"],
  ["Ghosts & Hauntings", "Old places, lingering presences and the feeling that you are not quite alone.", "/category-ghosts.webp"],
  ["Strange Creatures", "Unfamiliar tracks, fleeting silhouettes and Cornwall’s wilder witnesses.", "/category-creatures.webp"],
  ["Cornish Mysteries", "Folklore, odd histories and curious corners of the Duchy that keep their secrets.", "/category-cornish.webp"],
] as const;

export default function Home() {
  return (
    <main>
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="hero-art">
          <Image src="/reference-artwork.png" alt="What the UFO?! artwork: a UFO beams green light onto a Cornish tin mine above a moonlit coast" fill priority sizes="100vw" />
        </div>
        <div className="mobile-hero-copy">
          <p>Strange Encounters of the Cornish Kind</p>
        </div>
        <div className="container hero-intro">
          <p className="eyebrow">A curious Cornish community</p>
          <h1 id="home-hero-title">Have you seen something you can’t explain?</h1>
          <p>From strange lights over the Cornish coast to things that go bump in the night, this is your place to share experiences, explore the unexplained and decide for yourself.</p>
          <div className="hero-actions">
            <Link href="/report" className="button">Share your encounter</Link>
            <Link href="/encounters" className="button button-outline">Explore the files</Link>
          </div>
        </div>
      </section>

      <section className="section latest-section">
        <div className="container">
          <SectionHeading eyebrow="Fresh from the casebook" title="Latest encounters" copy="Fictional demonstrations of the stories this archive will hold. No example below is presented as a genuine report." action={<Link className="text-link" href="/encounters">View all encounters</Link>} />
          <div className="encounter-grid">{encounters.slice(0, 3).map((encounter) => <EncounterCard key={encounter.slug} encounter={encounter} />)}</div>
        </div>
      </section>

      <section className="matts-preview">
        <div className="container casefile-wrap">
          <div className="casefile-photo">
            <div className="archive-emblem" role="img" aria-label="Temporary What the UFO founder archive emblem">
              <span className="emblem-orbit" aria-hidden="true" />
              <strong>WTU</strong>
              <small>Founder Archive</small>
            </div>
            <p>Temporary founder emblem</p>
          </div>
          <div className="casefile-copy">
            <p className="stamp">Founder’s archive · awaiting material</p>
            <p className="eyebrow dark">Matt’s Files</p>
            <h2>The stories that started it all.</h2>
            <p>Matt James founded What the UFO?! as a home for strange experiences told without ridicule. His own introduction and personal case files will live here once supplied—carefully presented in his words, never invented on his behalf.</p>
            <Link href="/matts-files" className="ink-link">Enter Matt’s archive</Link>
          </div>
        </div>
      </section>

      <section className="section unknown-section">
        <div className="container">
          <SectionHeading eyebrow="Choose your rabbit hole" title="Explore the unknown" copy="Begin with the question that keeps you looking up—or makes you hurry home." />
          <div className="unknown-grid">
            {unknowns.map(([title, copy, image], index) => (
              <Link href={`/encounters?category=${encodeURIComponent(title)}`} className="unknown-tile" key={title}>
                <Image src={image} alt={`Illustrative atmospheric scene for ${title}; not encounter evidence`} fill sizes="(max-width: 700px) 100vw, 50vw" />
                <span className="unknown-index">0{index + 1}</span>
                <div><h3>{title}</h3><p>{copy}</p><span>Browse files</span></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section mothership-preview">
        <div className="container mothership-grid">
          <div className="mothership-copy">
            <p className="eyebrow">The Mothership</p>
            <h2>Pull up a chair. Keep an open mind.</h2>
            <p>A future discussion space for thoughtful theories, local knowledge and the occasional spirited debate. Reading will be open to all; posting will require a verified account in a later phase.</p>
            <Link className="button button-outline" href="/mothership">Preview the community</Link>
          </div>
          <div className="topic-stack">
            {discussions.map((topic) => (
              <Link href={`/mothership/${topic.slug}`} className="topic-row" key={topic.slug}>
                <i className="topic-icon" aria-hidden="true">{topic.icon}</i>
                <div><span>{topic.category}</span><h3>{topic.title}</h3></div>
                <p>{topic.replies}<small>sample replies</small></p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="cta-saucer" aria-hidden="true"><span /></div>
        <div className="container">
          <p className="marker">No ridicule. Just curiosity.</p>
          <h2>Got a story nobody believes?</h2>
          <p>We’d love to hear it. No ridicule, just curiosity.</p>
          <Link className="button" href="/report">Beam it in</Link>
        </div>
      </section>
    </main>
  );
}
