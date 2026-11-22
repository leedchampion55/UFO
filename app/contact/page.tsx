import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = { title: "Contact" };
export default function ContactPage() {
  return <main><PageHero eyebrow="Contact" title="Send a signal" copy="General correspondence is still offline, but contributors can manage encounters securely." /><section className="section contact-section"><div className="container contact-grid"><div><p className="eyebrow">Contributor requests</p><h2>Need your story altered or removed?</h2><p>Use the case reference and private recovery token shown after submission. The automated route can remove your public attribution or take the encounter out of public view and erase your contact details.</p><a className="button" href="/removal-request">Manage my encounter</a></div><div><p className="eyebrow">General enquiries</p><h2>Public inbox awaiting launch.</h2><p>The operator email address still needs to be confirmed. No decorative contact form pretends to send a message in the meantime.</p><div className="contact-status"><span>Offline</span><p>General contact channel awaiting launch configuration</p></div></div></div></section></main>;
}
