import type { Metadata } from "next";
import Link from "next/link";
import { EncounterCard } from "@/components/EncounterCard";
import { PageHero } from "@/components/PageHero";
import { prisma } from "@/lib/prisma";
import { encounterCardData } from "@/lib/public-encounters";

export const metadata: Metadata = { title: "Encounter Archive", description: "Explore approved encounters published by What the UFO?!" };
export const dynamic = "force-dynamic";
const pageSize = 9;

export default async function EncountersPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; sort?: string; page?: string }> }) {
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? "";
  const category = params.category ?? "";
  const sort = params.sort === "encounter-date" ? "encounter-date" : "published";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const categories = await prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const where = {
    status: "PUBLISHED" as const, publishedAt: { not: null }, founderFile: false, deletedAt: null,
    ...(category ? { category: { slug: category } } : {}),
    ...(query ? { OR: [
      { title: { contains: query, mode: "insensitive" as const } },
      { storyContent: { contains: query, mode: "insensitive" as const } },
      { summary: { contains: query, mode: "insensitive" as const } },
      { approximateLocation: { contains: query, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [total, encounters] = await Promise.all([
    prisma.encounter.count({ where }),
    prisma.encounter.findMany({ where, include: { category: true }, orderBy: sort === "encounter-date" ? [{ encounterDate: "desc" }, { publishedAt: "desc" }] : [{ publishedAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageHref = (nextPage: number) => `/encounters?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(category ? { category } : {}), sort, page: String(nextPage) })}`;
  return <main><PageHero eyebrow="The encounter archive" title="Cases from the edge of ordinary" copy="Every story here has been reviewed and approved before publication. Read with curiosity and decide for yourself." /><section className="section archive-section"><div className="container archive-wrap"><form className="archive-controls" method="get"><div className="search-field"><label htmlFor="encounter-search">Search the files</label><input id="encounter-search" name="q" type="search" defaultValue={query} placeholder="Title, place or keyword" /></div><div className="select-field"><label htmlFor="encounter-category">Category</label><select id="encounter-category" name="category" defaultValue={category}><option value="">All encounters</option>{categories.map((item) => <option value={item.slug} key={item.id}>{item.name}</option>)}</select></div><div className="select-field"><label htmlFor="encounter-sort">Sort</label><select id="encounter-sort" name="sort" defaultValue={sort}><option value="published">Publication date</option><option value="encounter-date">Encounter date</option></select></div><button className="button button-small">Search files</button></form><div className="results-summary"><strong>{total}</strong> published {total === 1 ? "case" : "cases"}</div>{encounters.length ? <><div className="encounter-grid">{encounters.map((encounter) => <EncounterCard key={encounter.id} encounter={encounterCardData(encounter)} />)}</div>{pages > 1 && <nav className="pagination" aria-label="Archive pages">{page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link href={pageHref(page + 1)}>Next</Link>}</nav>}</> : <div className="empty-state"><span aria-hidden="true">◌</span><h2>No encounters in the archive yet</h2><p>{query || category ? "No published encounters match those filters." : "Be the first to share something strange."}</p><Link className="button" href="/report">Share an encounter</Link></div>}</div></section></main>;
}
