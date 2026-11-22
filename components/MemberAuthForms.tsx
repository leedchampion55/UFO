"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/redirects";

export function RegisterForm() {
  const [state, setState] = useState<{ loading?: boolean; error?: string; success?: string }>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState({ loading: true });
    const response = await fetch("/api/members/register", { method: "POST", headers: { "content-type": "application/json", "x-ufo-request": "same-origin" }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
    const result = await response.json() as { error?: string; message?: string };
    setState(response.ok ? { success: result.message } : { error: result.error ?? "Registration failed." });
  }
  if (state.success) return <div className="auth-success"><h2>Check your signal</h2><p>{state.success}</p>{process.env.NODE_ENV !== "production" && <Link className="button" href="/dev/mail">Open development mailbox</Link>}</div>;
  return <form className="auth-form" onSubmit={submit}><div className="form-field"><label htmlFor="register-email">Email</label><input id="register-email" name="email" type="email" required autoComplete="email" /></div><div className="form-field"><label htmlFor="register-username">Public username</label><input id="register-username" name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" /><small>Letters, numbers and underscores. This is public.</small></div><div className="form-field"><label htmlFor="register-password">Password</label><input id="register-password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></div><input className="honeypot" name="website" tabIndex={-1} autoComplete="off" /><p className="form-error" role="alert">{state.error}</p><button className="button" disabled={state.loading}>{state.loading ? "Opening channel…" : "Create free account"}</button></form>;
}

export function SignInForm() {
  const router = useRouter(); const search = useSearchParams();
  const [state, setState] = useState<{ loading?: boolean; error?: string }>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState({ loading: true }); const data = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({ email: String(data.get("email")), password: String(data.get("password")), rememberMe: true });
    if (result.error) { setState({ error: result.error.message ?? "Sign-in failed." }); return; }
    router.push(safeInternalPath(search.get("next"), "/account")); router.refresh();
  }
  return <form className="auth-form" onSubmit={submit}><div className="form-field"><label htmlFor="signin-email">Email</label><input id="signin-email" name="email" type="email" required autoComplete="email" /></div><div className="form-field"><label htmlFor="signin-password">Password</label><input id="signin-password" name="password" type="password" required autoComplete="current-password" /></div><p className="form-error" role="alert">{state.error}</p><button className="button" disabled={state.loading}>{state.loading ? "Tuning frequency…" : "Sign in"}</button><Link className="text-link" href="/forgot-password">Forgot your password?</Link></form>;
}

export function RecoveryForm() {
  const [state, setState] = useState<{ loading?: boolean; message?: string }>({});
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setState({ loading: true }); const data = new FormData(event.currentTarget); await fetch("/api/auth/request-password-reset", { method: "POST", headers: { "content-type": "application/json", "x-ufo-request": "same-origin" }, body: JSON.stringify({ email: data.get("email"), redirectTo: "/reset-password" }) }); setState({ message: "If that account exists, a recovery message has been created." }); }
  return <form className="auth-form" onSubmit={submit}><div className="form-field"><label htmlFor="recovery-email">Email</label><input id="recovery-email" name="email" type="email" required /></div>{state.message && <p className="auth-message">{state.message}</p>}<button className="button" disabled={state.loading}>Send recovery message</button></form>;
}

export function ResetPasswordForm() {
  const token = useSearchParams().get("token"); const [state, setState] = useState<{ error?: string; success?: boolean }>({});
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); if (!token) return setState({ error: "This recovery link is incomplete." }); const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "content-type": "application/json", "x-ufo-request": "same-origin" }, body: JSON.stringify({ token, newPassword: data.get("password") }) }); setState(response.ok ? { success: true } : { error: "This recovery link is invalid or expired." }); }
  if (state.success) return <div className="auth-success"><h2>Password changed</h2><Link className="button" href="/sign-in">Sign in</Link></div>;
  return <form className="auth-form" onSubmit={submit}><div className="form-field"><label htmlFor="new-password">New password</label><input id="new-password" name="password" type="password" minLength={12} maxLength={128} required /></div><p className="form-error">{state.error}</p><button className="button">Set new password</button></form>;
}
