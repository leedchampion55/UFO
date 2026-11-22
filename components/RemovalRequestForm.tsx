"use client";

import { FormEvent, useState } from "react";

export function RemovalRequestForm() {
  const [state, setState] = useState<{ loading?: boolean; error?: string; message?: string }>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ loading: true });
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/removal-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const result = await response.json() as { error?: string; message?: string };
    setState(response.ok ? { message: result.message } : { error: result.error ?? "The request could not be completed." });
  }

  if (state.message) return <div className="submission-success compact"><span aria-hidden="true">✓</span><h2>Request confirmed</h2><p>{state.message}</p></div>;

  return (
    <form className="report-form" onSubmit={submit}>
      <div className="form-field"><label htmlFor="caseReference">Case reference</label><input id="caseReference" name="caseReference" placeholder="WTU-2026-…" required autoComplete="off" /></div>
      <div className="form-field"><label htmlFor="removalToken">Private recovery token</label><input id="removalToken" name="removalToken" required minLength={48} maxLength={48} autoComplete="off" /></div>
      <fieldset className="form-field"><legend>What should happen?</legend><label className="check-field"><input name="action" type="radio" value="anonymise" defaultChecked /> Remove my name but keep the story</label><label className="check-field"><input name="action" type="radio" value="remove" /> Remove the story and erase my contact details</label></fieldset>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="button" disabled={state.loading}>{state.loading ? "Verifying…" : "Confirm request"}</button>
    </form>
  );
}
