import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { MapStylePicker } from "../components/MapStylePicker.tsx";
import { Button } from "../components/ui/button.tsx";
import { Field, Input } from "../components/ui/input.tsx";
import { useAuth } from "../lib/auth.tsx";
import type { Role } from "../lib/api.ts";
import { DEFAULT_MAP_STYLE, type MapStyle, saveMapStyle } from "../lib/mapStyle.ts";

export function Register() {
  const [params] = useSearchParams();
  const initial = params.get("rol") === "driver" ? "driver" : "passenger";
  const [role, setRole] = useState<"passenger" | "driver">(initial);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    brand: "",
    model: "",
    year: "2020",
    color: "",
    plate: "",
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle["id"]>(DEFAULT_MAP_STYLE.id);
  const { register } = useAuth();
  const navigate = useNavigate();
  const referral = localStorage.getItem("ruta_referral") ?? "";

  function set(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload: Record<string, unknown> = {
      name: form.name,
      phone: form.phone,
      email: form.email || null,
      password: form.password,
      role,
      referral_code: referral || null,
    };
    if (role === "driver") {
      payload.vehicle = {
        brand: form.brand,
        model: form.model,
        year: Number(form.year),
        color: form.color,
        plate: form.plate,
      };
    }
    setPending(true);
    try {
      const user = await register(payload);
      saveMapStyle(user.id, mapStyle);
      const next: Record<Role, string> = { passenger: "/pasajero", driver: "/conductor", admin: "/admin" };
      navigate(next[user.role]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-foam px-5 py-8">
      <p className="font-display text-3xl text-marine">Crear cuenta</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {(["passenger", "driver"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded-full py-2 ${role === item ? "bg-marine text-taxi" : "bg-white"}`}
            onClick={() => setRole(item)}
          >
            {item === "passenger" ? "Pasajero" : "Conductor"}
          </button>
        ))}
      </div>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Field label="Nombre">
          <Input value={form.name} onChange={(event) => set("name", event.target.value)} required />
        </Field>
        <Field label="Teléfono">
          <Input value={form.phone} onChange={(event) => set("phone", event.target.value)} required />
        </Field>
        <Field label="Correo">
          <Input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
        </Field>
        <Field label="Contraseña">
          <Input type="password" value={form.password} onChange={(event) => set("password", event.target.value)} required minLength={8} />
        </Field>
        {role === "driver" && (
          <>
            <Field label="Marca">
              <Input value={form.brand} onChange={(event) => set("brand", event.target.value)} required />
            </Field>
            <Field label="Modelo">
              <Input value={form.model} onChange={(event) => set("model", event.target.value)} required />
            </Field>
            <Field label="Año">
              <Input value={form.year} onChange={(event) => set("year", event.target.value)} required />
            </Field>
            <Field label="Color">
              <Input value={form.color} onChange={(event) => set("color", event.target.value)} required />
            </Field>
            <Field label="Placa">
              <Input value={form.plate} onChange={(event) => set("plate", event.target.value)} required />
            </Field>
          </>
        )}
        <div>
          <MapStylePicker value={mapStyle} onChange={setMapStyle} />
          <p className="mt-2 text-xs text-muted">Puedes cambiarlo después en tu perfil.</p>
        </div>
        {referral && <p className="text-sm text-route">Código de referido: {referral}</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" variant="taxi" className="w-full" disabled={pending}>
          {pending ? "Creando cuenta" : "Crear cuenta"}
        </Button>
      </form>
      <Link to="/entrar" className="mt-6 inline-block text-sm text-marine">
        Ya tengo cuenta
      </Link>
    </div>
  );
}
