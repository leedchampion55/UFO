"use client";

import { useState } from "react";

type Category = { id: string; name: string };
type Success = { message: string; caseReference: string; removalToken: string };

export function ReportForm({ categories }: { categories: Category[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Success | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/encounters", { method: "POST", headers: { "x-ufo-request": "same-origin" }, body: new FormData(event.currentTarget) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The transmission failed.");
      setSuccess(result); event.currentTarget.reset(); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The transmission failed. Please try again."); }
    finally { setPending(false); }
  }

  if (success) return <div className="submission-success" role="status"><span aria-hidden="true">✦</span><p className="eyebrow">Transmission received</p><h2>{success.message}</h2><p>Your private reference is <strong>{success.caseReference}</strong>.</p><details><summary>Save your removal-request token</summary><code>{success.removalToken}</code><p>Keep this token private. It helps verify a future removal request.</p></details><button className="button button-outline" type="button" onClick={() => setSuccess(null)}>Send another encounter</button></div>;

  return <form className="report-form" onSubmit={submit} encType="multipart/form-data"><div className="form-status"><strong>Private until approved</strong><span>Your report is saved as pending and cannot appear publicly until Matt reviews it.</span></div><input className="honeypot" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
    <fieldset><legend>What happened?</legend><div className="form-grid"><div className="form-field"><label htmlFor="categoryId">Encounter category *</label><select id="categoryId" name="categoryId" defaultValue="" required><option value="" disabled>Choose the closest match</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></div><div className="form-field"><label htmlFor="title">A short title *</label><input id="title" name="title" minLength={5} maxLength={140} required placeholder="Give your encounter a name" /></div><div className="form-field full"><label htmlFor="description">Tell us what you experienced *</label><textarea id="description" name="description" rows={10} minLength={80} maxLength={30000} required placeholder="Take your time. What did you notice, and what happened next?" /></div><div className="form-field"><label htmlFor="approximateDate">Approximate date</label><input id="approximateDate" name="approximateDate" placeholder="For example: late summer 2024" /></div><div className="form-field"><label htmlFor="approximateTime">Approximate time</label><input id="approximateTime" name="approximateTime" placeholder="For example: around 11 pm" /></div><div className="form-field"><label htmlFor="approximateLocation">Approximate location</label><input id="approximateLocation" name="approximateLocation" placeholder="Town, coast or general area—no exact address" /></div><div className="form-field"><label htmlFor="region">Country or region</label><input id="region" name="region" placeholder="Cornwall, UK" /></div><div className="form-field"><label htmlFor="witnessCount">Number of witnesses</label><input id="witnessCount" name="witnessCount" type="number" min={1} max={1000} /></div><div className="form-field"><label htmlFor="videoLinks">Optional video links</label><textarea id="videoLinks" name="videoLinks" rows={3} placeholder="HTTPS YouTube or Vimeo links, one per line" /></div><div className="form-field full"><label htmlFor="photos">Up to five optional photographs</label><div className="file-field"><input id="photos" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" /><span>Choose image files</span><small>JPEG, PNG or WebP. Maximum 10 MB each. Metadata including GPS is removed.</small></div></div></div></fieldset>
    <fieldset><legend>How should we credit you?</legend><label className="check-field"><input type="checkbox" name="publishAnonymously" value="true" /><span><strong>Publish anonymously</strong><small>Your public story will be credited to “Anonymous contributor”.</small></span></label><div className="form-grid compact-grid"><div className="form-field"><label htmlFor="displayName">Public display name</label><input id="displayName" name="displayName" maxLength={100} placeholder="Name or pseudonym" /></div><div className="form-field"><label htmlFor="privateEmail">Private contact email <span>(optional)</span></label><input id="privateEmail" name="privateEmail" type="email" maxLength={254} placeholder="For editorial follow-up only" /></div></div></fieldset>
    <fieldset><legend>Publication consent</legend><label className="check-field"><input type="checkbox" name="publicationConsent" value="true" required /><span>I confirm this is my account to share and consent to editorial review and possible publication. Formatting may be edited without changing the substance of my testimony.</span></label></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" type="submit" disabled={pending}>{pending ? "Transmitting…" : "Send to Mission Control"}</button><p className="submit-note">No account is required. Nothing is published automatically.</p></form>;
}
