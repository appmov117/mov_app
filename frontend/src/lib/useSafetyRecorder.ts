import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";

export type RecordingKind = "audio" | "video";

/** Cada fragmento se cierra y se sube por separado para no perder lo grabado si el teléfono se apaga. */
const SEGMENT_MS = 60_000;

const MIME_TYPES: Record<RecordingKind, string[]> = {
  audio: ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"],
  video: ["video/webm;codecs=vp8,opus", "video/mp4", "video/webm"],
};

type Session = {
  kind: RecordingKind;
  stream: MediaStream;
  id: string;
  segment: number;
  recorder: MediaRecorder | null;
  timer: number;
  stopping: boolean;
};

export function useSafetyRecorder(rideId: string | undefined) {
  const [kind, setKind] = useState<RecordingKind | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const session = useRef<Session | null>(null);

  async function upload(blob: Blob, current: Session, segment: number) {
    if (!rideId) return;
    const body = new FormData();
    body.append("kind", current.kind);
    body.append("session_id", current.id);
    body.append("segment", String(segment));
    body.append("file", blob, `${current.kind}-${segment}`);
    setUploading((count) => count + 1);
    try {
      await api(`/api/v1/rides/${rideId}/safety/recordings`, { method: "POST", body });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la grabación");
    } finally {
      setUploading((count) => count - 1);
    }
  }

  function recordSegment(current: Session) {
    const mimeType = MIME_TYPES[current.kind].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(current.stream, {
      mimeType,
      audioBitsPerSecond: 32_000,
      videoBitsPerSecond: current.kind === "video" ? 600_000 : undefined,
    });
    const chunks: Blob[] = [];
    const segment = current.segment++;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (blob.size > 0) void upload(blob, current, segment);
      if (!current.stopping) recordSegment(current);
    };
    recorder.start();
    current.recorder = recorder;
    current.timer = window.setTimeout(() => recorder.state !== "inactive" && recorder.stop(), SEGMENT_MS);
  }

  async function start(next: RecordingKind) {
    if (session.current || !rideId) return;
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: next === "video" ? { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
      const current: Session = { kind: next, stream: media, id: crypto.randomUUID(), segment: 0, recorder: null, timer: 0, stopping: false };
      session.current = current;
      recordSegment(current);
      setKind(next);
      setStream(media);
      setSeconds(0);
    } catch {
      setError(next === "video" ? "Permite el acceso a la cámara y al micrófono para grabar." : "Permite el acceso al micrófono para grabar.");
    }
  }

  function stop() {
    const current = session.current;
    if (!current) return;
    current.stopping = true;
    window.clearTimeout(current.timer);
    if (current.recorder?.state !== "inactive") current.recorder?.stop();
    current.stream.getTracks().forEach((track) => track.stop());
    session.current = null;
    setKind(null);
    setStream(null);
  }

  useEffect(() => {
    if (!kind) return;
    const tick = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(tick);
  }, [kind]);

  useEffect(() => stop, []);

  return { kind, stream, seconds, uploading, error, start, stop };
}

export type SafetyRecorder = ReturnType<typeof useSafetyRecorder>;
