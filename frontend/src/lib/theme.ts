import { useSyncExternalStore } from "react";

export const THEMES = [
  { id: "light", label: "Claro", detail: "Siempre claro" },
  { id: "dark", label: "Oscuro", detail: "Siempre oscuro; cansa menos la vista de noche" },
  { id: "system", label: "Sistema", detail: "Sigue el modo claro u oscuro del teléfono" },
] as const;

export type Theme = (typeof THEMES)[number]["id"];

const KEY = "ruta-theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.find((theme) => theme.id === saved)?.id ?? "light";
  } catch {
    return "light";
  }
}

function isDark(): boolean {
  const theme = readTheme();
  return theme === "dark" || (theme === "system" && media.matches);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marca el tema elegido en <html>; con "Sistema" lo decide la media query del CSS. */
export function applyTheme() {
  const theme = readTheme();
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

media.addEventListener("change", () => listeners.forEach((listener) => listener()));

/** Tema elegido por el usuario en este dispositivo y la función para cambiarlo. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme);
  const choose = (id: Theme) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Sin almacenamiento el cambio dura solo mientras la página siga abierta.
    }
    applyTheme();
    listeners.forEach((listener) => listener());
  };
  return [theme, choose] as const;
}

/** True cuando la app se ve en oscuro, ya sea por elección o por el sistema. */
export function useDarkMode() {
  return useSyncExternalStore(subscribe, isDark);
}
