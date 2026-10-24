import { api } from "./api.ts";

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/**
 * Pide permiso (si hace falta) y registra este dispositivo para recibir push.
 * Llamarla desde un toque del usuario la primera vez; iOS lo exige para mostrar el permiso.
 */
export async function enablePush(): Promise<boolean> {
  if (!supported()) return false;
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return false;
  const { public_key: publicKey } = await api<{ public_key: string | null }>("/api/v1/notifications/vapid-public");
  if (!publicKey) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = subscription.toJSON();
  await api("/api/v1/notifications/push", {
    method: "POST",
    body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }),
  });
  return true;
}

/** Vuelve a registrar el dispositivo sin pedir permiso, p. ej. al abrir la app ya con sesión. */
export function syncPush() {
  if (supported() && Notification.permission === "granted") void enablePush().catch(() => undefined);
}

/** Da de baja este dispositivo al cerrar sesión para que no reciba avisos de otra cuenta. */
export async function disablePush() {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api("/api/v1/notifications/push/remove", { method: "POST", body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(
    () => undefined,
  );
  await subscription.unsubscribe();
}
