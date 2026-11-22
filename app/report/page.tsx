import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { ReportForm } from "@/components/ReportForm";

export const metadata: Metadata = { title: "Report an Encounter" };

export default function ReportPage() {
  return (
    <main>
      <PageHero eyebrow="Report an encounter" title="Tell us what you saw" copy="No account will be required. Share publicly under a display name or anonymously—once submissions are activated in Phase 2." />
      <section className="report-section"><div className="container report-layout"><div className="report-intro"><p className="marker">You tell it. We’ll listen.</p><h2>Your story, your choices.</h2><p>Exact locations are not required. Contact details will be optional and private. Matt will review every future submission before anything appears publicly.</p><ul><li>No ridicule or pressure to explain it.</li><li>Anonymous public attribution supported.</li><li>No registration required to submit.</li><li>You choose whether publication is allowed.</li></ul></div><ReportForm /></div></section>
    </main>
  );
}
