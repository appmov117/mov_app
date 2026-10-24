import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../lib/api.ts";
import { Button } from "./ui/button.tsx";

type Props = { name: string | undefined; endpoint: string; queryKey: string[] };

export function EditableName({ name, endpoint, queryKey }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const rename = useMutation({
    mutationFn: (value: string) => api<unknown>(endpoint, { method: "PATCH", body: JSON.stringify({ name: value }) }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, (current: object | undefined) => ({ ...current, ...(updated as object) }));
      setEditing(false);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (value.length < 2 || value === name) return setEditing(false);
    rename.mutate(value);
  }

  if (editing) {
    return (
      <>
        <form className="mt-3 flex w-full max-w-xs items-center gap-2" onSubmit={submit}>
          <input
            autoFocus
            value={draft}
            maxLength={80}
            aria-label="Nombre"
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-center font-bold outline-none focus:border-ink"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setEditing(false)}
          />
          <Button size="sm" className="w-auto" disabled={rename.isPending}>
            {rename.isPending ? "Guardando" : "Guardar"}
          </Button>
        </form>
        {rename.error && <p className="mt-2 text-sm text-danger">{(rename.error as Error).message}</p>}
      </>
    );
  }

  if (!name) return <span className="mt-3 block h-7 w-40 animate-pulse rounded bg-line" />;

  return (
    <button
      type="button"
      className="group mt-3 inline-flex items-center gap-2 text-xl font-extrabold"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      {name}
      <Pencil size={15} className="text-ink/35 group-hover:text-ink" aria-label="Editar nombre" />
    </button>
  );
}
