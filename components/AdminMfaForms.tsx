"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/redirects";

async function verifyCode(method: "totp" | "recovery", code: string) {
  const response = await fetch("/api/admin/mfa/verify", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ufo-request": "same-origin" },
    body: JSON.stringify({ method, code }),
  });
  if (!response.ok) throw new Error("That code was not accepted. Check it and try again.");
}

export function AdminMfaChallengeForm({ destination = "/admin" }: { destination?: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<"totp" | "recovery">("totp");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    try {
      await verifyCode(method, code);
      router.replace(safeInternalPath(destination, "/admin"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
      setPending(false);
    }
  }

  return <form className="admin-login-form" onSubmit={submit}>
    <div className="mfa-methods" role="group" aria-label="Authentication method">
      <button type="button" className={method === "totp" ? "active" : ""} onClick={() => setMethod("totp")}>Authenticator code</button>
      <button type="button" className={method === "recovery" ? "active" : ""} onClick={() => setMethod("recovery")}>Recovery code</button>
    </div>
    <div className="form-field"><label htmlFor="mfa-code">{method === "totp" ? "Six-digit code" : "One-time recovery code"}</label><input id="mfa-code" name="code" inputMode={method === "totp" ? "numeric" : "text"} autoComplete="one-time-code" required minLength={6} maxLength={64} autoFocus /></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" disabled={pending}>{pending ? "Verifying…" : "Verify clearance"}</button>
  </form>;
}

export function AdminMfaSetupForm() {
  const router = useRouter();
  const [setup, setSetup] = useState<{ uri: string; secret: string; backupCodes: string[] } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const result = await authClient.twoFactor.enable({ password, method: "totp", issuer: "What the UFO?! Mission Control" });
    setPending(false);
    if (result.error || !result.data || result.data.method !== "totp" || !result.data.totpURI || !result.data.backupCodes) {
      setError("MFA setup could not be started. Check your password and try again."); return;
    }
    const uri = result.data.totpURI;
    setSetup({ uri, secret: new URL(uri).searchParams.get("secret") ?? "", backupCodes: result.data.backupCodes });
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    try {
      await verifyCode("totp", code);
      router.replace("/admin"); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "MFA setup failed."); setPending(false);
    }
  }

  if (!setup) return <form className="admin-login-form" onSubmit={begin}>
    <p>Confirm your administrator password to create a protected authenticator secret.</p>
    <div className="form-field"><label htmlFor="mfa-password">Administrator password</label><input id="mfa-password" name="password" type="password" autoComplete="current-password" minLength={12} required /></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button" disabled={pending}>{pending ? "Preparing…" : "Begin MFA enrolment"}</button>
  </form>;

  return <div className="mfa-setup-details">
    <h2>1. Add the authenticator</h2>
    <p>On this device, use the button below. On another device, enter the setup key manually in your authenticator app.</p>
    <a className="button button-small" href={setup.uri}>Open authenticator app</a>
    <code className="mfa-secret">{setup.secret}</code>
    <h2>2. Store the recovery codes</h2>
    <p>Save these offline now. Each code works once. They cannot be shown again from this screen.</p>
    <ul className="recovery-code-list">{setup.backupCodes.map((code) => <li key={code}><code>{code}</code></li>)}</ul>
    <h2>3. Verify enrolment</h2>
    <form className="admin-login-form" onSubmit={finish}><div className="form-field"><label htmlFor="mfa-enrol-code">Six-digit authenticator code</label><input id="mfa-enrol-code" name="code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={8} required /></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" disabled={pending}>{pending ? "Verifying…" : "Complete enrolment"}</button></form>
  </div>;
}

export function RegenerateRecoveryCodesForm() {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const result = await authClient.twoFactor.generateBackupCodes({ password });
    if (result.error || !result.data?.backupCodes) return setError("Recovery codes could not be replaced. Check your password.");
    setCodes(result.data.backupCodes);
  }
  if (codes) return <div><p className="form-status"><strong>Previous codes are now invalid.</strong></p><ul className="recovery-code-list">{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ul><p>Store these codes offline, then leave this page.</p></div>;
  return <form className="mission-form" onSubmit={submit}><div className="form-field"><label htmlFor="recovery-password">Administrator password</label><input id="recovery-password" name="password" type="password" autoComplete="current-password" required minLength={12} /></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button">Replace recovery codes</button></form>;
}
