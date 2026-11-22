import type { Encounter, Category } from "@/generated/prisma/client";
import type { EncounterCardData } from "@/components/EncounterCard";

type PublicEncounter = Encounter & { category: Category };

export function encounterCardData(encounter: PublicEncounter): EncounterCardData {
  return {
    slug: encounter.slug,
    caseReference: encounter.caseReference,
    category: encounter.category.name,
    title: encounter.title,
    location: encounter.approximateLocation,
    date: encounter.approximateDate ?? encounter.encounterDate?.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) ?? null,
    summary: encounter.summary ?? `${encounter.storyContent.slice(0, 170).trim()}${encounter.storyContent.length > 170 ? "…" : ""}`,
    image: encounter.category.imagePath ?? "/category-cornish.webp",
  };
}
