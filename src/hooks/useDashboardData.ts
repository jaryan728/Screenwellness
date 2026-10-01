import { useCallback, useEffect, useState } from "react";
import { getDb } from "../store/db";

export interface AppUsage {
  appName: string;
  totalSeconds: number;
}

export interface DashboardData {
  totalSeconds: number;
  appUsages: AppUsage[];
  lastRefreshed: Date;
}

export function useDashboardData(refreshMs = 30_000): DashboardData & { refresh: () => void } {
  const [data, setData] = useState<DashboardData>({
    totalSeconds: 0,
    appUsages: [],
    lastRefreshed: new Date(),
  });

  const fetchData = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ app_name: string; total_seconds: number }[]>(
        `SELECT app_name, SUM(duration_seconds) AS total_seconds
         FROM sessions
         WHERE date(start_time, 'localtime') = date('now', 'localtime')
         GROUP BY app_name
         ORDER BY total_seconds DESC`
      );
      const totalSeconds = rows.reduce((s, r) => s + r.total_seconds, 0);
      setData({
        totalSeconds,
        appUsages: rows.map((r) => ({ appName: r.app_name, totalSeconds: r.total_seconds })),
        lastRefreshed: new Date(),
      });
    } catch (err) {
      console.error("Dashboard fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, refreshMs);
    return () => clearInterval(id);
  }, [fetchData, refreshMs]);

  return { ...data, refresh: fetchData };
}
