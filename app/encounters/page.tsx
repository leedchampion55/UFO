import type { Metadata } from "next";
import { EncountersExplorer } from "@/components/EncountersExplorer";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "Encounter Archive", description: "Explore the fictional demonstration case files for the What the UFO?! frontend." };

export default async function EncountersPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  return (
    <main>
      <PageHero eyebrow="The encounter archive" title="Cases from the edge of ordinary" copy="Search a Phase 1 demonstration archive. Every item is fictional placeholder content, clearly separated from future community reports." />
      <section className="section archive-section"><EncountersExplorer initialCategory={category} /></section>
    </main>
  );
}
