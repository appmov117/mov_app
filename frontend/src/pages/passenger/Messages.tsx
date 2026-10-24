import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Shell } from "../../components/Shell.tsx";
import { api } from "../../lib/api.ts";
import { when } from "../../lib/format.ts";

type Note = { id: string; title: string; body: string; created_at: string | null; read_at: string | null };

export function PassengerMessages() {
  const notes = useQuery({ queryKey: ["notes"], queryFn: () => api<Note[]>("/api/v1/notifications") });
  const items = notes.data ?? [];

  return (
    <Shell>
      <div className="flex-1 bg-white px-4 py-5">
        <h1 className="text-[28px] font-extrabold tracking-tight">Mensajes</h1>
        {items.length === 0 && (
          <div className="mt-16 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-foam text-muted">
              <MessageCircle />
            </span>
            <p className="mt-4 font-bold">Sin mensajes por ahora</p>
            <p className="mx-auto mt-1 max-w-[28ch] text-sm text-muted">Los avisos de tu viaje aparecen aquí.</p>
          </div>
        )}
        <ul className="mt-4">
          {items.map((note) => (
            <li key={note.id} className="border-b border-line py-4">
              <p className="font-bold">{note.title}</p>
              <p className="mt-1 text-sm text-ink/70">{note.body}</p>
              <p className="mt-1 text-xs text-muted">{when(note.created_at)}</p>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
