import Image from "next/image";
import Link from "next/link";

export type EncounterCardData = {
  slug: string;
  caseReference: string;
  category: string;
  title: string;
  location?: string | null;
  date?: string | null;
  summary?: string | null;
  image: string;
};

export function EncounterCard({ encounter }: { encounter: EncounterCardData }) {
  return (
    <article className="encounter-card">
      <Link href={`/encounters/${encounter.slug}`} className="card-image" aria-label={`Read ${encounter.title}`}>
        <Image src={encounter.image} alt={`Illustrative atmospheric scene for ${encounter.category}; not encounter evidence`} fill sizes="(max-width: 700px) 100vw, 33vw" />
        <span className="demo-stamp">{encounter.caseReference}</span>
      </Link>
      <div className="card-body">
        <p className="card-category">{encounter.category}</p>
        <h3><Link href={`/encounters/${encounter.slug}`}>{encounter.title}</Link></h3>
        <div className="card-meta"><span>{encounter.location || "Location withheld"}</span><span>{encounter.date || "Date not supplied"}</span></div>
        {encounter.summary && <p>{encounter.summary}</p>}
        <Link href={`/encounters/${encounter.slug}`} className="text-link">Open case file</Link>
      </div>
    </article>
  );
}
