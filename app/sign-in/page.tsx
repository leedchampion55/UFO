import { Suspense } from "react";
import { SignInForm } from "@/components/MemberAuthForms";
export default function SignInPage() { return <main className="member-auth-page"><section className="auth-panel"><p className="eyebrow">Member frequency</p><h1>Sign in</h1><p>Return to The Mothership.</p><Suspense><SignInForm /></Suspense><p>New here? <a href="/register">Create a free account</a>.</p></section></main>; }
