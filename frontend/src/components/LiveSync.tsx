import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../lib/auth.tsx";
import { messagesKey, onLive, startLive } from "../lib/live.ts";

/** Consultas que dependen de ofertas, solicitudes y viajes; se refrescan con cada aviso. */
const syncKeys = {
  driver: [["driver"], ["offers"], ["driver-active"], ["membership"], ["driver-rides"], ["driver-stats"]],
  passenger: [["passenger-active"], ["passenger-recent"], ["history"]],
} as const;

/** Mantiene abierto el canal en vivo de la sesión y traduce sus avisos a la caché de consultas. */
export function LiveSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const role = user?.role === "driver" || user?.role === "passenger" ? user.role : null;

  useEffect(() => {
    if (!role) return;
    const stopListening = onLive((message) => {
      if (message.type === "sync") {
        // Solo se vuelven a pedir las consultas montadas; las demás quedan marcadas como viejas.
        for (const queryKey of syncKeys[role]) void queryClient.invalidateQueries({ queryKey });
      } else if (message.type === "message") {
        void queryClient.invalidateQueries({ queryKey: messagesKey(message.ride_id) });
      }
    });
    const stopLive = startLive();
    return () => {
      stopListening();
      stopLive();
    };
  }, [role, user?.id, queryClient]);

  return null;
}
