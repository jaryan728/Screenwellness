import { useEffect, useRef, useState } from "react";

const STILL_THRESHOLD = 4;       // avg pixel diff per channel per pixel (0–255)
const STILL_SECONDS_TO_PAUSE = 120;
const SAMPLE_W = 80;
const SAMPLE_H = 60;

export function useCameraPresence(enabled: boolean) {
  const [isActive, setIsActive]     = useState(false);
  const [hasPresence, setHasPresence] = useState(true);
  const [isPaused, setIsPaused]     = useState(false);
  const [stream, setStream]         = useState<MediaStream | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const streamRef    = useRef<MediaStream | null>(null);
  const prevPixels   = useRef<Uint8ClampedArray | null>(null);
  const stillCount   = useRef(0);
  const videoEl      = useRef<HTMLVideoElement | null>(null);
  const canvasEl     = useRef<HTMLCanvasElement | null>(null);

  // start/stop camera when enabled changes
  useEffect(() => {
    if (!enabled) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      setIsActive(false);
      setHasPresence(true);
      setIsPaused(false);
      setError(null);
      prevPixels.current = null;
      stillCount.current = 0;
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: SAMPLE_W * 4, height: SAMPLE_H * 4 } })
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        setStream(s);
        setIsActive(true);
        setError(null);

        // attach to hidden video element for frame capture
        if (!videoEl.current) {
          const v = document.createElement("video");
          v.srcObject = s;
          v.muted = true;
          v.autoplay = true;
          v.playsInline = true;
          videoEl.current = v;
        } else {
          videoEl.current.srcObject = s;
        }
        videoEl.current.play().catch(() => {});
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      setIsActive(false);
    };
  }, [enabled]);

  // pixel diff loop
  useEffect(() => {
    if (!isActive) return;

    if (!canvasEl.current) {
      const c = document.createElement("canvas");
      c.width  = SAMPLE_W;
      c.height = SAMPLE_H;
      canvasEl.current = c;
    }
    const ctx = canvasEl.current.getContext("2d");
    if (!ctx) return;

    prevPixels.current = null;
    stillCount.current = 0;

    const id = setInterval(() => {
      const video = videoEl.current;
      if (!video || video.readyState < 2) return;

      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      const frame = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;

      if (prevPixels.current) {
        let total = 0;
        const n = frame.length;
        for (let i = 0; i < n; i += 4) {
          total += Math.abs(frame[i]   - prevPixels.current[i]);
          total += Math.abs(frame[i+1] - prevPixels.current[i+1]);
          total += Math.abs(frame[i+2] - prevPixels.current[i+2]);
        }
        const avgDiff = total / ((n / 4) * 3);

        if (avgDiff > STILL_THRESHOLD) {
          stillCount.current = 0;
          setHasPresence(true);
          setIsPaused(false);
        } else {
          stillCount.current++;
          if (stillCount.current >= STILL_SECONDS_TO_PAUSE) {
            setHasPresence(false);
            setIsPaused(true);
          }
        }
      }

      prevPixels.current = new Uint8ClampedArray(frame);
    }, 1_000);

    return () => clearInterval(id);
  }, [isActive]);

  return { isActive, hasPresence, isPaused, stream, error };
}
