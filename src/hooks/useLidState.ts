import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getDb } from "../store/db";

export interface PauseEntry {
  id: number;
  paused_at: string;
  resumed_at: string | null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(from: string, to: string): string {
  const mins = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatPauseEntry(e: PauseEntry): string {
  if (e.resumed_at) {
    return `Paused at ${fmtTime(e.paused_at)}, resumed at ${fmtTime(e.resumed_at)} — ${fmtDuration(e.paused_at, e.resumed_at)} not counted`;
  }
  return `Paused at ${fmtTime(e.paused_at)} — lid still closed`;
}

async function loadLog(): Promise<PauseEntry[]> {
  const db = await getDb();
  return db.select<PauseEntry[]>(
    "SELECT id, paused_at, resumed_at FROM lid_log ORDER BY id DESC LIMIT 20"
  );
}

async function recordSleep(): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO lid_log (paused_at, resumed_at) VALUES (datetime('now','localtime'), NULL)"
  );
}

async function recordWake(): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE lid_log SET resumed_at = datetime('now','localtime') WHERE resumed_at IS NULL ORDER BY id DESC LIMIT 1"
  );
}

export function useLidState() {
  const [isPaused, setIsPaused] = useState(false);
  const [pauseLog, setPauseLog] = useState<PauseEntry[]>([]);
  const pausedRef = useRef(false);

  async function refreshLog() {
    try {
      setPauseLog(await loadLog());
    } catch { /* ignore */ }
  }

  useEffect(() => {
    refreshLog();

    let unlistenSleep: (() => void) | undefined;
    let unlistenWake: (() => void) | undefined;

    (async () => {
      unlistenSleep = await listen("display-sleep", async () => {
        if (pausedRef.current) return; // already paused
        pausedRef.current = true;
        setIsPaused(true);
        try { await recordSleep(); } catch { /* ignore */ }
        await refreshLog();
      });

      unlistenWake = await listen("display-wake", async () => {
        if (!pausedRef.current) return; // already running
        pausedRef.current = false;
        setIsPaused(false);
        try { await recordWake(); } catch { /* ignore */ }
        await refreshLog();
      });
    })();

    return () => {
      unlistenSleep?.();
      unlistenWake?.();
    };
  }, []);

  return { isPaused, pauseLog };
}
