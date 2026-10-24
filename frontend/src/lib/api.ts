const ACCESS = "ruta_access";
const REFRESH = "ruta_refresh";

export type Role = "passenger" | "driver" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  status: string;
  driver_id?: string | null;
  passenger_id?: string | null;
  verification_status?: string | null;
  driver_status?: string | null;
};

type Tokens = { access_token: string; refresh_token: string };

let refreshPromise: Promise<boolean> | null = null;

export function accessToken() {
  return localStorage.getItem(ACCESS);
}

export function saveTokens(tokens: Tokens) {
  localStorage.setItem(ACCESS, tokens.access_token);
  localStorage.setItem(REFRESH, tokens.refresh_token);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

async function refreshTokens() {
  if (refreshPromise) return refreshPromise;

  const refresh = localStorage.getItem(REFRESH);
  if (!refresh) return false;

  refreshPromise = (async () => {
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!response.ok) {
      // Otra pestaña pudo renovar la sesión mientras esta petición esperaba.
      if (localStorage.getItem(REFRESH) === refresh) clearTokens();
      return false;
    }
    saveTokens(await response.json());
    return true;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function send(path: string, options: RequestInit, retry: boolean): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = accessToken();
  const refresh = localStorage.getItem(REFRESH);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  }
  if (response.status === 401 && retry && !path.includes("/auth/login")) {
    // Si otra petición o pestaña ya renovó la sesión, reintenta con ese token.
    if (accessToken() !== token || localStorage.getItem(REFRESH) !== refresh) {
      return send(path, options, false);
    }
    const refreshed = await refreshTokens();
    if (refreshed) return send(path, options, false);
    if (accessToken() !== token || localStorage.getItem(REFRESH) !== refresh) {
      return send(path, options, false);
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: "No se pudo completar la acción" }));
    const detail = typeof payload.detail === "string" ? payload.detail : "No se pudo completar la acción";
    throw new Error(detail);
  }
  return response;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await send(path, options, true);
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function apiBlob(path: string): Promise<Blob> {
  return (await send(path, {}, true)).blob();
}
