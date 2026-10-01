import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { playTick } from "../store/sound";

const IDLE_THRESHOLD_SECONDS = 120;
const POLL_INTERVAL_MS = 1_000; // 1s for per-second countdown + tick sounds

export interface BreakReminderState {
  continuousSeconds: number;
  nextBreakIn: number;
  isIdle: boolean;
}

export async function fireNotification(title: string, body: string): Promise<void> {
  await invoke("send_notification", { title, body });
}

export function useBreakReminder(
  intervalMinutes: number,
  onBreakDue?: () => void,
  isPaused?: boolean
): BreakReminderState {
  const [continuousSeconds, setContinuousSeconds] = useState(0);
  const [isIdle, setIsIdle] = useState(false);

  const continuousRef = useRef(0);
  const intervalRef = useRef(intervalMinutes);
  const onBreakDueRef = useRef(onBreakDue);
  const isPausedRef = useRef(isPaused ?? false);
  const prevPausedRef = useRef(isPaused ?? false);

  useEffect(() => { intervalRef.current = intervalMinutes; }, [intervalMinutes]);
  useEffect(() => { onBreakDueRef.current = onBreakDue; }, [onBreakDue]);

  // reset break timer on lid-open (paused → not paused)
  useEffect(() => {
    isPausedRef.current = isPaused ?? false;
    if (prevPausedRef.current && !(isPaused ?? false)) {
      continuousRef.current = 0;
      setContinuousSeconds(0);
    }
    prevPausedRef.current = isPaused ?? false;
  }, [isPaused]);

  const poll = useCallback(async () => {
    if (isPausedRef.current) return;
    try {
      const idle = await invoke<number>("get_idle_seconds");
      const idleNow = idle > IDLE_THRESHOLD_SECONDS;
      setIsIdle(idleNow);

      if (idleNow) {
        if (continuousRef.current > 0) {
          continuousRef.current = 0;
          setContinuousSeconds(0);
        }
      } else {
        continuousRef.current += POLL_INTERVAL_MS / 1000;
        setContinuousSeconds(continuousRef.current);

        const thresholdSeconds = intervalRef.current * 60;
        const remaining = thresholdSeconds - continuousRef.current;

        // tick in last 5 seconds
        if (remaining > 0 && remaining <= 5) {
          playTick();
        }

        if (continuousRef.current >= thresholdSeconds) {
          continuousRef.current = 0;
          setContinuousSeconds(0);
          onBreakDueRef.current?.();
        }
      }
    } catch (e) {
      console.error("Break reminder poll error:", e);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const thresholdSeconds = intervalMinutes * 60;
  const nextBreakIn = Math.max(0, thresholdSeconds - continuousSeconds);

  return { continuousSeconds, nextBreakIn, isIdle };
}
