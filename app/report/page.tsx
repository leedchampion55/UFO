import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { ReportForm } from "@/components/ReportForm";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Report an Encounter" };

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const categories = await prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <main>
      <PageHero eyebrow="Report an encounter" title="Tell us what you saw" copy="No account is required. Share for editorial review under a display name or anonymously; nothing is published automatically." />
      <section className="report-section"><div className="container report-layout"><div className="report-intro"><p className="marker">You tell it. We’ll listen.</p><h2>Your story, your choices.</h2><p>Exact locations are not required. Contact details are optional and kept private. Matt reviews every submission before anything appears publicly.</p><ul><li>No ridicule or pressure to explain it.</li><li>Anonymous public attribution supported.</li><li>No registration required to submit.</li><li>You choose whether publication is allowed.</li></ul></div><ReportForm categories={categories} /></div></section>
    </main>
  );
}
