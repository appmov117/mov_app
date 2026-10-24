import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

/** Cada cuánto se pregunta al servidor si hay una versión nueva mientras la app está abierta. */
const CHECK_MS = 10 * 60 * 1000;

/** Avisa cuando hay una versión nueva de la app y la instala al tocar "Actualizar". */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Avisa al service worker que esta versión muestra el botón; sin la marca se actualizaría solo.
      void caches.open("ruta-flags").then((flags) => flags.put("/__update-prompt", new Response("1"))).catch(() => undefined);
      const check = () => {
        if (navigator.onLine && document.visibilityState === "visible") registration.update().catch(() => undefined);
      };
      window.setInterval(check, CHECK_MS);
      document.addEventListener("visibilitychange", check);
    },
  });

  if (!needRefresh || import.meta.env.DEV) return null;

  function update() {
    // El plugin solo recarga si detectó la versión al abrir la app; aquí se recarga siempre.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    updateServiceWorker(false);
  }

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-surface shadow-lg"
    >
      <span className="flex-1 text-sm">Hay una versión nueva de Ruta.</span>
      <button
        type="button"
        onClick={update}
        className="flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold text-ink active:scale-[0.98]"
      >
        <RefreshCw size={15} aria-hidden="true" />
        Actualizar
      </button>
    </div>
  );
}
