import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearTokens, saveTokens, type SessionUser } from "./api.ts";
import { disablePush, syncPush } from "./push.ts";
import { clearQueryCache } from "./queryCache.ts";

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<SessionUser>;
  register: (payload: Record<string, unknown>) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

async function currentUser() {
  return api<SessionUser>("/api/v1/auth/me");
}

/** Id del usuario dentro del token (campo `sub`), sin validarlo: solo para comparar sesiones. */
function tokenUser(token: string | null) {
  try {
    return token ? (JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub as string) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    try {
      setUser(await currentUser());
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) syncPush();
  }, [user?.id]);

  // Las pestañas del mismo navegador comparten la sesión. Si otra pestaña entra con otra cuenta,
  // esta deja de poder leer sus datos y fallaría en silencio: se recarga con la cuenta nueva.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "ruta_access" || !user) return;
      if (tokenUser(event.newValue) !== user.id) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user?.id]);

  async function login(identifier: string, password: string) {
    const tokens = await api<{ access_token: string; refresh_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    saveTokens(tokens);
    // Otra cuenta pudo usar este dispositivo: no se muestran sus datos guardados.
    await clearQueryCache();
    const me = await currentUser();
    setUser(me);
    return me;
  }

  async function register(payload: Record<string, unknown>) {
    const tokens = await api<{ access_token: string; refresh_token: string }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    saveTokens(tokens);
    await clearQueryCache();
    const me = await currentUser();
    setUser(me);
    return me;
  }

  async function logout() {
    await disablePush().catch(() => undefined);
    const refresh = localStorage.getItem("ruta_refresh");
    if (refresh) {
      await api("/api/v1/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: refresh }) }).catch(
        () => undefined,
      );
    }
    clearTokens();
    await clearQueryCache();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider falta en el árbol");
  return value;
}
