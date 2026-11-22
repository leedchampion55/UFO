"use client";

import { useState } from "react";

export function ReportForm() {
  const [hasFiles, setHasFiles] = useState(false);
  return (
    <form className="report-form" onSubmit={(event) => event.preventDefault()}>
      <div className="form-status" role="status"><strong>Preview only</strong><span>This form cannot send or save information in Phase 1. Submission functionality will be activated in Phase 2.</span></div>
      <fieldset>
        <legend>What happened?</legend>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="category">Encounter category</label><select id="category" defaultValue=""><option value="" disabled>Choose the closest match</option><option>UFOs & UAPs</option><option>Ghosts & Hauntings</option><option>Strange Creatures</option><option>Cornish Mysteries</option><option>Something else</option></select></div>
          <div className="form-field"><label htmlFor="title">A short title</label><input id="title" placeholder="Give your encounter a name" /></div>
          <div className="form-field full"><label htmlFor="description">Tell us what you experienced</label><textarea id="description" rows={9} placeholder="Take your time. What did you notice, and what happened next?" /></div>
          <div className="form-field"><label htmlFor="date">Approximate date</label><input id="date" type="date" /></div>
          <div className="form-field"><label htmlFor="location">Approximate location</label><input id="location" placeholder="Town, coast or general area—no exact address" /></div>
          <div className="form-field full"><label htmlFor="photos">Optional photographs</label><div className="file-field"><input id="photos" type="file" multiple accept="image/*" onChange={(event) => setHasFiles(Boolean(event.target.files?.length))} /><span>{hasFiles ? "Files selected for preview only" : "Choose image files"}</span><small>Files remain on your device and are not uploaded in Phase 1.</small></div></div>
        </div>
      </fieldset>
      <fieldset>
        <legend>How should we credit you?</legend>
        <div className="radio-stack">
          <label><input type="radio" name="credit" defaultChecked /><span><strong>Use a public display name</strong><small>A name or pseudonym would appear with an approved story.</small></span></label>
          <label><input type="radio" name="credit" /><span><strong>Publish anonymously</strong><small>Your public story would be credited to “Anonymous contributor”.</small></span></label>
        </div>
        <div className="form-grid compact-grid">
          <div className="form-field"><label htmlFor="display-name">Public display name</label><input id="display-name" placeholder="Name or pseudonym" /></div>
          <div className="form-field"><label htmlFor="email">Private contact email <span>(optional)</span></label><input id="email" type="email" placeholder="For editorial follow-up only" /></div>
        </div>
      </fieldset>
      <fieldset>
        <legend>Publication consent</legend>
        <label className="check-field"><input type="checkbox" /><span>I confirm this is my account to share and understand that a future submission would be reviewed by Matt before publication. I can submit without creating an account.</span></label>
      </fieldset>
      <button className="button" type="submit" disabled aria-describedby="submit-note">Submission activates in Phase 2</button>
      <p id="submit-note" className="submit-note">Nothing entered here will be saved or sent.</p>
    </form>
  );
}
