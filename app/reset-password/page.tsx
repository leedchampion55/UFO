import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/MemberAuthForms";
export default function ResetPasswordPage() { return <main className="member-auth-page"><section className="auth-panel"><p className="eyebrow">Account recovery</p><h1>Choose a new password</h1><Suspense><ResetPasswordForm /></Suspense></section></main>; }
