"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function AdminLogout() {
  const router = useRouter();
  return <button className="admin-logout" type="button" onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => { router.push("/admin/login"); router.refresh(); } } })}>Log out</button>;
}
