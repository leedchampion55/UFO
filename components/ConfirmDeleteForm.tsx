"use client";

import { deleteEncounter } from "@/app/admin/actions";

export function ConfirmDeleteForm({ id }: { id: string }) {
  return <form action={deleteEncounter} onSubmit={(event) => { if (!window.confirm("Delete and anonymise this encounter? The audit record will remain.")) event.preventDefault(); }}><input type="hidden" name="id" value={id} /><button className="danger-button" type="submit">Delete and anonymise</button></form>;
}
