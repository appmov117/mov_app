import { useEffect, useState } from "react";

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionRequest = { requestPermission?: () => Promise<"granted" | "denied"> };

/** Cambios menores a esto no se dibujan: la brújula vibra y redibujar cada grado gasta batería. */
const MIN_CHANGE_DEG = 4;
const MIN_INTERVAL_MS = 120;

function screenAngle() {
  return screen.orientation?.angle ?? 0;
}

/**
 * Rumbo de la brújula del teléfono en grados desde el norte, o null si no hay brújula.
 *
 * Donde el navegador pide permiso (iPhone) se solicita con el primer toque en la pantalla.
 */
export function useCompass(enabled: boolean) {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof DeviceOrientationEvent === "undefined") return;
    let last = -999;
    let lastAt = 0;
    const update = (value: number) => {
      const now = performance.now();
      const delta = Math.abs(((value - last + 540) % 360) - 180);
      if (delta < MIN_CHANGE_DEG || now - lastAt < MIN_INTERVAL_MS) return;
      last = value;
      lastAt = now;
      setHeading(value);
    };
    const onIOS = (event: Event) => {
      const value = (event as IOSOrientationEvent).webkitCompassHeading;
      if (value != null) update((value + screenAngle()) % 360);
    };
    // En Android "absolute" da alpha respecto al norte, en sentido contrario a las manecillas.
    const onAbsolute = (event: Event) => {
      const { alpha } = event as DeviceOrientationEvent;
      if (alpha != null) update((360 - alpha + screenAngle()) % 360);
    };
    const absolute = "ondeviceorientationabsolute" in window;
    const listen = () => {
      if (absolute) window.addEventListener("deviceorientationabsolute", onAbsolute);
      else window.addEventListener("deviceorientation", onIOS);
    };
    const orientation = DeviceOrientationEvent as unknown as PermissionRequest;
    // Safari solo concede el permiso dentro de un toque completo (click o touchend).
    const stopAsking = () => {
      window.removeEventListener("click", ask);
      window.removeEventListener("touchend", ask);
    };
    const ask = () => {
      void orientation
        .requestPermission?.()
        .then((state) => {
          stopAsking();
          if (state === "granted") listen();
        })
        // Fuera de un gesto válido se rechaza: se vuelve a intentar con el siguiente toque.
        .catch(() => undefined);
    };
    // Donde no hace falta permiso los eventos llegan desde ya; en iPhone empiezan tras aceptar.
    listen();
    if (orientation.requestPermission) {
      window.addEventListener("click", ask);
      window.addEventListener("touchend", ask);
    }
    return () => {
      stopAsking();
      window.removeEventListener("deviceorientationabsolute", onAbsolute);
      window.removeEventListener("deviceorientation", onIOS);
    };
  }, [enabled]);

  return heading;
}
