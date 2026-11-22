"use client";

import { useMemo, useState } from "react";
import { EncounterCard } from "./EncounterCard";
import { categories, encounters } from "@/data/site";

export function EncountersExplorer({ initialCategory = "All encounters" }: { initialCategory?: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(categories.includes(initialCategory as (typeof categories)[number]) ? initialCategory : "All encounters");
  const [sort, setSort] = useState("case");

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return encounters
      .filter((item) => category === "All encounters" || item.category === category)
      .filter((item) => !normalized || [item.title, item.summary, item.location, item.category].join(" ").toLowerCase().includes(normalized))
      .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "oldest" ? b.caseNumber.localeCompare(a.caseNumber) : a.caseNumber.localeCompare(b.caseNumber));
  }, [query, category, sort]);

  return (
    <div className="container archive-wrap">
      <div className="archive-controls" aria-label="Filter fictional demonstration encounters">
        <div className="search-field">
          <label htmlFor="encounter-search">Search the files</label>
          <input id="encounter-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, place or keyword" />
        </div>
        <div className="select-field">
          <label htmlFor="encounter-category">Category</label>
          <select id="encounter-category" value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </div>
        <div className="select-field">
          <label htmlFor="encounter-sort">Sort</label>
          <select id="encounter-sort" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="case">Newest case number</option>
            <option value="oldest">Oldest case number</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </div>
      <div className="results-summary" aria-live="polite"><strong>{results.length}</strong> fictional demonstration {results.length === 1 ? "case" : "cases"}</div>
      {results.length ? <div className="encounter-grid">{results.map((encounter) => <EncounterCard key={encounter.slug} encounter={encounter} />)}</div> : (
        <div className="empty-state">
          <span aria-hidden="true">◌</span>
          <h2>No signals found</h2>
          <p>Try a broader search or another category. The truth may be out there, but it is not in this filter.</p>
          <button className="button" type="button" onClick={() => { setQuery(""); setCategory("All encounters"); }}>Clear filters</button>
        </div>
      )}
    </div>
  );
}
