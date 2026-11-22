import Link from "next/link";
import { PageHero } from "./PageHero";

export function LegalPlaceholder({ type }: { type: "Privacy" | "Terms" }) {
  return (
    <>
      <PageHero eyebrow="Pre-launch draft" title={type} copy={`This ${type.toLowerCase()} page describes the Phase 2 prototype and still requires legal review before launch.`} />
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
          <p>Phase 2 stores encounter details, optional contact information and private uploads for editorial review. Public pages only show approved, published material; private contact details are kept separately and are never published.</p>
          <p>Every submission receives a private recovery token. Contributors can use it to <Link href="/removal-request">remove or anonymise their encounter</Link>. This prototype still needs an operator contact address and a legally reviewed retention schedule before launch.</p>
        </article>
      </main>
    </>
  );
}
