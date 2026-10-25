import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button.tsx";
import { Field, Input } from "../components/ui/input.tsx";
import { useAuth } from "../lib/auth.tsx";
import type { Role } from "../lib/api.ts";

const home: Record<Role, string> = {
  passenger: "/pasajero",
  driver: "/conductor",
  admin: "/admin",
};

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const user = await login(identifier, password);
      navigate(home[user.role]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-foam px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <Link to="/" aria-label="Volver" className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-ink">
        <ChevronLeft size={24} />
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">Entrar</h1>
      <form className="mt-8 space-y-4" onSubmit={submit}>
        <Field label="Teléfono o correo">
          <Input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
          />
        </Field>
        <Field label="Contraseña">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="pr-12"
              required
            />
            <button
              type="button"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPassword}
              className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-xl text-muted"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" variant="taxi" className="w-full" disabled={pending}>
          {pending ? "Entrando" : "Entrar"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        ¿No tienes cuenta?{" "}
        <Link to="/registro" className="font-semibold text-ink underline">
          Crear cuenta
        </Link>
      </p>
    </div>
  );
}
