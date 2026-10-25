import { Camera, Check } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { shrinkImage } from "../lib/image.ts";

/** Al entregar un paquete: foto de la entrega y el código que da quien recibe. */
export function DeliveryProof({
  rideId,
  hasPhoto,
  code,
  onCode,
  onUploaded,
}: {
  rideId: string;
  hasPhoto: boolean;
  code: string;
  onCode: (code: string) => void;
  onUploaded: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setPending(true);
    try {
      const body = new FormData();
      body.append("file", await shrinkImage(file, 1280), "entrega.jpg");
      await api(`/api/v1/rides/${rideId}/delivery-photo`, { method: "POST", body });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2 rounded-2xl bg-white/10 p-3">
      <p className="text-sm font-semibold">Comprobante de entrega</p>
      <button
        type="button"
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:opacity-60 ${hasPhoto ? "bg-ok/25" : "bg-surface text-ink"}`}
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        {hasPhoto ? <Check size={16} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
        {pending ? "Subiendo foto" : hasPhoto ? "Foto lista · tomar otra" : "Tomar foto de la entrega"}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
      <input
        inputMode="numeric"
        value={code}
        placeholder="Código de 4 dígitos de quien recibe"
        aria-label="Código de entrega"
        className="h-12 w-full rounded-2xl bg-surface px-3 text-center text-lg font-bold tracking-[0.3em] text-ink placeholder:text-sm placeholder:font-normal placeholder:tracking-normal"
        onChange={(event) => onCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
      />
      {error && <p className="text-sm text-[#F2C14E]">{error}</p>}
    </div>
  );
}
