import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { discussions } from "@/data/site";

export const metadata: Metadata = { title: "The Mothership" };
const boards = [["First Encounters", "Introductions and the story that brought you here.", "11 demo topics"], ["Open Casebook", "Discuss possible explanations without dismissing the witness.", "24 demo topics"], ["Cornish Folklore", "Old tales, local knowledge and mysteries rooted in place.", "17 demo topics"], ["Skywatch", "What’s overhead, where to look and what can be identified.", "31 demo topics"]];

export default function MothershipPage() {
  return <main><PageHero eyebrow="Community preview" title="The Mothership" copy="A future meeting place for curious minds. Everything shown here is an illustrative frontend preview; posting and accounts are not active." />
    <section className="section boards-section"><div className="container"><div className="community-notice"><strong>Read openly. Participate thoughtfully.</strong><p>Anyone will be able to read. Registered, email-verified members will be able to reply when community features launch.</p><button className="button button-small" disabled>Registration coming later</button></div><div className="board-grid">{boards.map(([title, copy, meta]) => <article className="board-card" key={title}><span aria-hidden="true">✦</span><h2>{title}</h2><p>{copy}</p><small>{meta}</small></article>)}</div></div></section>
    <section className="section topics-section"><div className="container"><p className="eyebrow">Illustrative discussions</p><h2>Latest transmissions</h2><div className="topic-list"><div className="topic-list-head"><span>Topic</span><span>Replies</span><span>Status</span></div>{discussions.map((topic) => <Link href={`/mothership/${topic.slug}`} className="topic-list-row" key={topic.slug}><div className="topic-title-cell"><i aria-hidden="true">{topic.icon}</i><div><small>{topic.category}</small><h3>{topic.title}</h3></div></div><strong>{topic.replies}</strong><span>{topic.freshness}</span></Link>)}</div></div></section>
  </main>;
}
