import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

export function ReferralLanding() {
  const { code = "" } = useParams();
  useEffect(() => {
    if (code) localStorage.setItem("ruta_referral", code.toUpperCase());
  }, [code]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-between bg-night px-6 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-white">
      <p className="font-display text-3xl">Ruta</p>
      <div>
        <h1 className="font-display text-4xl leading-none">Te invitaron a viajar con Ruta.</h1>
        <p className="mt-4 text-white/75">Código {code.toUpperCase()}. El pago del viaje es directo al conductor.</p>
      </div>
      <Link to="/registro?rol=passenger" className="rounded-full bg-taxi px-5 py-3 text-center font-medium text-night">
        Crear cuenta de pasajero
      </Link>
    </div>
  );
}
