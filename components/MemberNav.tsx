"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function MemberNav({ close }: { close?: () => void }) {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  if (isPending) return <span className="sign-in">Checking signal…</span>;
  if (!data?.user || (data.user as { role?: string }).role !== "member") return <><Link className="sign-in" href="/sign-in" onClick={close}>Sign in</Link><Link className="member-register" href="/register" onClick={close}>Register</Link></>;
  return <><Link className="sign-in" href="/account" onClick={close}>My account</Link><button className="member-register" type="button" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => { close?.(); router.push("/"); router.refresh(); } } })}>Sign out</button></>;
}
