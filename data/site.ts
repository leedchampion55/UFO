export type Encounter = {
  slug: string;
  caseNumber: string;
  category: "UFOs & UAPs" | "Ghosts & Hauntings" | "Strange Creatures" | "Cornish Mysteries";
  title: string;
  location: string;
  date: string;
  summary: string;
  image: string;
  imagePosition: string;
  story: string[];
};

export const encounters: Encounter[] = [
  {
    slug: "lights-over-bodmin-moor",
    caseNumber: "DEMO-001",
    category: "UFOs & UAPs",
    title: "Lights Over Bodmin Moor",
    location: "Near Minions, Cornwall",
    date: "Autumn 2024",
    summary: "Three silent lights appear to hold formation above the moor before vanishing together.",
    image: "/category-ufo.webp",
    imagePosition: "72% 34%",
    story: [
      "This fictional demonstration account shows how a future published encounter could read. It is not a genuine report.",
      "The contributor describes stopping on a quiet road after noticing three lights above the horizon. The lights appeared evenly spaced and made no sound. After less than a minute, all three faded at the same moment.",
      "No conclusion is offered. Future case pages will preserve the contributor’s words, distinguish observation from interpretation, and clearly label supporting evidence.",
    ],
  },
  {
    slug: "whispers-at-the-engine-house",
    caseNumber: "DEMO-002",
    category: "Ghosts & Hauntings",
    title: "Whispers at the Engine House",
    location: "West Cornwall coast",
    date: "Winter 2023",
    summary: "A late walk past a ruined mine is interrupted by footsteps where no path remains.",
    image: "/category-ghosts.webp",
    imagePosition: "90% 63%",
    story: [
      "This is fictional placeholder content created solely to demonstrate the future case-file layout.",
      "The imagined witness reports hearing measured footsteps behind them while walking near a disused engine house. When they stopped, the sound stopped too. The area appeared empty and the nearest road was some distance away.",
      "A real published account would include editorial notes, consent status, approximate rather than precise location, and any submitted photographs with captions.",
    ],
  },
  {
    slug: "the-lantern-in-the-cove",
    caseNumber: "DEMO-003",
    category: "Cornish Mysteries",
    title: "The Lantern in the Cove",
    location: "A cove near the Lizard",
    date: "Summer 2022",
    summary: "An impossible green glow moves across a cove long after the last boat has gone home.",
    image: "/category-cornish.webp",
    imagePosition: "23% 68%",
    story: [
      "This demonstration is fictional and must not be interpreted as a documented local event.",
      "Two walkers notice a green light tracking along the waterline below. It disappears behind an outcrop, but does not emerge on the other side. From the cliff path, neither walker can see a person or boat.",
      "Future reports will invite readers to consider ordinary explanations alongside the strange ones. Curiosity is welcome; certainty is not required.",
    ],
  },
  {
    slug: "something-beyond-the-gorse",
    caseNumber: "DEMO-004",
    category: "Strange Creatures",
    title: "Something Beyond the Gorse",
    location: "North Cornwall",
    date: "Spring 2021",
    summary: "A low silhouette crosses a moonlit field with a gait the observer cannot place.",
    image: "/category-creatures.webp",
    imagePosition: "72% 80%",
    story: [
      "This is an invented example used to preview the archive experience. It is not a genuine sighting.",
      "The fictional observer describes a dark shape moving across a field beyond a hedge. Its scale and distance were difficult to judge in the moonlight, and the sighting lasted only a few seconds.",
      "The page intentionally leaves room for uncertainty. Future moderation will avoid sensationalising contributors or presenting speculation as fact.",
    ],
  },
];

export const categories = ["All encounters", "UFOs & UAPs", "Ghosts & Hauntings", "Strange Creatures", "Cornish Mysteries"] as const;

export const discussions = [
  { slug: "what-did-you-see", category: "First Encounters", icon: "◉", title: "What was the moment that made you look twice?", replies: 18, freshness: "Illustrative topic" },
  { slug: "cornish-skywatch", category: "Skywatch", icon: "✦", title: "Good dark-sky spots around Cornwall", replies: 27, freshness: "Illustrative topic" },
  { slug: "ordinary-explanations", category: "Open Casebook", icon: "⌁", title: "The best ordinary explanation you almost missed", replies: 12, freshness: "Illustrative topic" },
];
