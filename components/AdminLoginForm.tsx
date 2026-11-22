"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(data.get("email")),
      password: String(data.get("password")),
      rememberMe: false,
    });
    setPending(false);
    if (result.error) {
      setError(result.error.status === 429 ? "Too many attempts. Wait a few minutes before trying again." : "Those sign-in details were not recognised.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <form className="admin-login-form" onSubmit={submit}>
      <div className="form-field"><label htmlFor="admin-email">Administrator email</label><input id="admin-email" name="email" type="email" autoComplete="username" required /></div>
      <div className="form-field"><label htmlFor="admin-password">Password</label><input id="admin-password" name="password" type="password" autoComplete="current-password" minLength={12} required /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" disabled={pending}>{pending ? "Checking clearance…" : "Enter Mission Control"}</button>
    </form>
  );
}
