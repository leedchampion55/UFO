import Link from "next/link";
export default function VerifiedPage() { return <main className="member-auth-page"><section className="auth-panel auth-success"><p className="eyebrow">Signal confirmed</p><h1>Email verified</h1><p>Your account can now join encounter comments and The Mothership.</p><Link className="button" href="/sign-in">Sign in</Link></section></main>; }
