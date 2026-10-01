import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "../store/db";

async function saveSession(
  appName: string,
  startTime: Date,
  endTime: Date
): Promise<void> {
  const db = await getDb();
  const durationSeconds = Math.round(
    (endTime.getTime() - startTime.getTime()) / 1000
  );
  await db.execute(
    "INSERT INTO sessions (app_name, start_time, end_time, duration_seconds) VALUES (?, ?, ?, ?)",
    [appName, startTime.toISOString(), endTime.toISOString(), durationSeconds]
  );
}

export interface WindowTrackerState {
  currentApp: string;
  timeOnApp: number;
}

export function useWindowTracker(): WindowTrackerState {
  const [currentApp, setCurrentApp] = useState("Loading...");
  const [timeOnApp, setTimeOnApp] = useState(0);

  const currentAppRef = useRef("");
  const sessionStartRef = useRef(new Date());
  const timeOnAppRef = useRef(0);

  useEffect(() => {
    getDb().catch(console.error);

    async function pollActiveWindow() {
      try {
        const appName = await invoke<string>("get_active_window");
        if (appName !== currentAppRef.current) {
          if (currentAppRef.current) {
            await saveSession(
              currentAppRef.current,
              sessionStartRef.current,
              new Date()
            ).catch(console.error);
          }
          currentAppRef.current = appName;
          sessionStartRef.current = new Date();
          timeOnAppRef.current = 0;
          setCurrentApp(appName);
          setTimeOnApp(0);
        }
      } catch (err) {
        console.error("get_active_window failed:", err);
      }
    }

    pollActiveWindow();

    const pollInterval = setInterval(pollActiveWindow, 5000);

    const tickInterval = setInterval(() => {
      timeOnAppRef.current += 1;
      setTimeOnApp(timeOnAppRef.current);
    }, 1000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
      if (currentAppRef.current) {
        saveSession(
          currentAppRef.current,
          sessionStartRef.current,
          new Date()
        ).catch(console.error);
      }
    };
  }, []);

  return { currentApp, timeOnApp };
}
