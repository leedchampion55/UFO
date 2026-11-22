import Image from "next/image";
import Link from "next/link";
import type { Encounter } from "@/data/site";

export function EncounterCard({ encounter }: { encounter: Encounter }) {
  return (
    <article className="encounter-card">
      <Link href={`/encounters/${encounter.slug}`} className="card-image" aria-label={`Read ${encounter.title}`}>
        <Image src={encounter.image} alt={`Illustrative atmospheric scene for ${encounter.category}; not encounter evidence`} fill sizes="(max-width: 700px) 100vw, 33vw" />
        <span className="demo-stamp">Illustrative demo</span>
      </Link>
      <div className="card-body">
        <p className="card-category">{encounter.category}</p>
        <h3><Link href={`/encounters/${encounter.slug}`}>{encounter.title}</Link></h3>
        <div className="card-meta"><span>{encounter.location}</span><span>{encounter.date}</span></div>
        <p>{encounter.summary}</p>
        <Link href={`/encounters/${encounter.slug}`} className="text-link">Open case file</Link>
      </div>
    </article>
  );
}
