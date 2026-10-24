import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Consultas que cambian poco y conviene mostrar al instante al abrir la app, incluso sin red. */
const PERSISTED = new Set(["meta", "history", "passenger", "passenger-places", "driver-rides", "driver-stats", "referral"]);

export const queryClient = new QueryClient({
  // La caché debe vivir al menos lo mismo que lo guardado en IndexedDB para poder restaurarlo.
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, gcTime: DAY_MS } },
});

const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: "ruta-cache",
  throttleTime: 2000,
});

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: DAY_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === "success" && PERSISTED.has(String(query.queryKey[0])),
  },
};

/** Borra los datos de la sesión en memoria y en IndexedDB (al salir o cambiar de cuenta). */
export async function clearQueryCache() {
  queryClient.clear();
  await persister.removeClient();
}
