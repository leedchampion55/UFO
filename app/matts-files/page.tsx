import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "Matt’s Files" };

export default function MattsFilesPage() {
  return (
    <main>
      <PageHero eyebrow="The founder’s archive" title="Matt’s Files" copy="A reserved space for founder Matt James to introduce the project and share his own experiences in his own words." />
      <section className="matts-archive"><div className="container archive-desk">
        <aside className="founder-photo"><div className="archive-emblem" role="img" aria-label="Temporary What the UFO founder archive emblem"><span className="emblem-orbit" aria-hidden="true" /><strong>WTU</strong><small>Founder Archive</small></div><p>Matt James · Founder</p></aside>
        <article className="founder-letter"><p className="marker">A note from Matt</p><h2>Introduction to come</h2><p>Matt’s personal introduction has not yet been supplied. This area is deliberately reserved rather than filled with invented biography or experiences.</p><p>The finished archive can hold first-person accounts, supporting photographs, dates and editorial context while keeping uncertainty and personal perspective intact.</p><div className="signature-line">Founder’s words will appear here</div></article>
        <div className="file-drawer"><div className="drawer-label"><span>Personal case files</span><strong>Awaiting material</strong></div>{["Case file reserved", "Case file reserved", "Case file reserved"].map((item, index) => <div className="empty-file" key={index}><span>MF-{String(index + 1).padStart(3, "0")}</span><h3>{item}</h3><p>No personal story has been invented for this placeholder.</p></div>)}<Link href="/contact" className="ink-link">Contact the project</Link></div>
      </div></section>
    </main>
  );
}
