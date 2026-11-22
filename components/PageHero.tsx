import type { ReactNode } from "react";

export function PageHero({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children?: ReactNode }) {
  return (
    <section className="page-hero">
      <div className="container page-hero-inner">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{copy}</p>
          {children}
        </div>
      </div>
    </section>
  );
}
