import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { initials } from "../lib/format.ts";
import { shrinkImage } from "../lib/image.ts";

/** Lado de la foto que se sube: suficiente para el perfil y pesa unos 50 KB. */
const SIZE = 512;

/** Foto de perfil con iniciales de respaldo; al tocarla se elige o se toma una foto nueva. */
export function ProfilePhoto({ name }: { name?: string }) {
  const { user, refreshUser } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function choose(file: File | undefined) {
    if (!file) return;
    setError("");
    setPending(true);
    try {
      const body = new FormData();
      body.append("file", await shrinkImage(file, SIZE, true), "foto.jpg");
      await api("/api/v1/users/me/avatar", { method: "POST", body });
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        className="relative h-20 w-20 rounded-full ring-4 ring-surface disabled:opacity-60"
        aria-label={user?.avatar_url ? "Cambiar foto de perfil" : "Subir foto de perfil"}
      >
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center rounded-full bg-foam text-2xl font-extrabold text-ink">
            {name ? initials(name) : ""}
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full bg-brand-strong text-white ring-2 ring-surface" aria-hidden="true">
          <Camera size={14} />
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(event) => void choose(event.target.files?.[0])} />
      {pending && <p className="mt-2 text-xs text-muted">Subiendo foto…</p>}
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}
    </>
  );
}
