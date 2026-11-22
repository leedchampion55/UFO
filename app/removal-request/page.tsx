import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { RemovalRequestForm } from "@/components/RemovalRequestForm";

export const metadata: Metadata = { title: "Remove or anonymise an encounter" };

export default function RemovalRequestPage() {
  return <main><PageHero eyebrow="Contributor controls" title="Reclassify your transmission" copy="Use the case reference and private recovery token supplied when you submitted your encounter." /><section className="section paper-section"><div className="container narrow"><div className="legal-warning"><strong>Keep your token private.</strong> It authorises changes to your encounter. Removal takes the story out of public view and erases the submitted contact details; anonymisation removes public attribution.</div><RemovalRequestForm /></div></section></main>;
}
