import Link from "next/link";
import { PageHero } from "./PageHero";

export function LegalPlaceholder({ type }: { type: "Privacy" | "Terms" }) {
  return (
    <>
      <PageHero eyebrow="Pre-launch draft" title={type} copy={`This ${type.toLowerCase()} page is a structural placeholder for Phase 1 and is not final legal advice.`} />
      <main className="paper-section">
        <article className="container prose-paper">
          <div className="legal-warning"><strong>Requires legal review before launch.</strong> The wording below indicates the topics the final policy should cover.</div>
          <h2>Purpose of this page</h2>
          <p>The finished version will explain how What the UFO?! operates, what visitors can expect, and the responsibilities that come with using the service.</p>
          <h2>Planned coverage</h2>
          <ul>
            <li>Encounter submissions, contributor choices, moderation and publication consent.</li>
            <li>Account and discussion data once member features are introduced.</li>
            <li>Contact details, retention periods, rights and complaint routes.</li>
            <li>Acceptable use, intellectual property, disclaimers and service availability.</li>
          </ul>
          <p>No backend collection, accounts or publishing system is active in Phase 1. See the <Link href="/contact">contact placeholder</Link> for the future enquiry route.</p>
        </article>
      </main>
    </>
  );
}
