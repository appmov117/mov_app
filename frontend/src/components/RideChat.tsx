import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../lib/api.ts";
import { clockTime } from "../lib/format.ts";
import { messagesKey, useLiveInterval } from "../lib/live.ts";

type Role = "passenger" | "driver";
type Message = { id: string; sender_role: Role; body: string; created_at: string | null; read_at: string | null };

const QUICK_REPLIES: Record<Role, string[]> = {
  passenger: ["Espera un momento, por favor", "Llego enseguida", "Ya estoy en el punto de recogida", "¿Dónde estás?"],
  driver: ["Ya llegué", "Estoy afuera", "Voy en camino", "Hay tráfico, llego en unos minutos"],
};

type Props = { rideId: string; role: Role; counterpart: string; className: string; children: ReactNode };

/** Botón que abre el chat del viaje y muestra cuántos mensajes nuevos hay. */
export function ChatButton({ rideId, role, counterpart, className, children }: Props) {
  const [open, setOpen] = useState(false);
  const interval = useLiveInterval(open ? 3000 : 5000);
  const messages = useQuery({
    queryKey: messagesKey(rideId),
    queryFn: () => api<Message[]>(`/api/v1/rides/${rideId}/messages`),
    refetchInterval: interval,
  });
  const unread = (messages.data ?? []).filter((row) => row.sender_role !== role && !row.read_at).length;

  return (
    <>
      <button type="button" className={`relative ${className}`} onClick={() => setOpen(true)}>
        {children}
        {unread > 0 && (
          <span className="absolute right-2 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && <ChatSheet rideId={rideId} role={role} counterpart={counterpart} messages={messages.data ?? []} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatSheet({
  rideId,
  role,
  counterpart,
  messages,
  onClose,
}: {
  rideId: string;
  role: Role;
  counterpart: string;
  messages: Message[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const unread = messages.some((row) => row.sender_role !== role && !row.read_at);

  const send = useMutation({
    mutationFn: (body: string) => api<Message>(`/api/v1/rides/${rideId}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: (message) => {
      setDraft("");
      queryClient.setQueryData<Message[]>(messagesKey(rideId), (rows = []) => [...rows, message]);
    },
  });

  useEffect(() => {
    if (!unread) return;
    api(`/api/v1/rides/${rideId}/messages/read`, { method: "POST" })
      .then(() => queryClient.invalidateQueries({ queryKey: messagesKey(rideId) }))
      .catch(() => undefined);
  }, [unread, rideId, queryClient]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim() && !send.isPending) send.mutate(draft.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="chat-title" onClick={onClose}>
      <section
        className="ruta-sheet flex h-[min(620px,85dvh)] w-full max-w-[430px] flex-col rounded-t-[28px] md:rounded-[28px] bg-white text-ink"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="chat-title" className="font-extrabold">{counterpart}</h2>
            <p className="text-xs text-muted">Los mensajes se cierran al terminar el viaje</p>
          </div>
          <button type="button" aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full bg-foam" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
          {messages.length === 0 && <p className="py-8 text-center text-sm text-muted">Escríbele o elige una respuesta rápida.</p>}
          {messages.map((row) => {
            const mine = row.sender_role === role;
            return (
              <div key={row.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <p className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-foam"}`}>
                  {row.body}
                  <span className={`mt-0.5 block text-right text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>
                    {clockTime(row.created_at)}
                    {mine && row.read_at ? " · Leído" : ""}
                  </span>
                </p>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>

        <div className="border-t border-line px-4 pb-4 pt-3">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3">
            {QUICK_REPLIES[role].map((reply) => (
              <button
                key={reply}
                type="button"
                disabled={send.isPending}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                onClick={() => send.mutate(reply)}
              >
                {reply}
              </button>
            ))}
          </div>
          <form className="flex items-center gap-2" onSubmit={submit}>
            <input
              value={draft}
              maxLength={500}
              placeholder="Escribe un mensaje"
              aria-label="Mensaje"
              className="h-11 min-w-0 flex-1 rounded-full bg-foam px-4 text-sm outline-none focus:ring-2 focus:ring-ink"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!draft.trim() || send.isPending}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-40"
            >
              <SendHorizontal size={18} />
            </button>
          </form>
          {send.error && <p className="mt-2 text-sm text-danger">{(send.error as Error).message}</p>}
        </div>
      </section>
    </div>
  );
}
