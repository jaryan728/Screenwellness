import { useEffect, useState } from "react";
import { getDb } from "../store/db";

export interface DayData {
  label: string;       // "Mon"
  date: string;        // "2026-09-24"
  screenMinutes: number;
  breaks: number;
  expectedBreaks: number;
  compliance: number;  // 0-100
}

export interface AppUsage {
  name: string;
  minutes: number;
}

export interface WeeklyReport {
  days: DayData[];
  avgCompliance: number;
  bestDay: DayData | null;
  worstDay: DayData | null;
  topApps: AppUsage[];
  eyeHealthScore: number;
  loading: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function last7Dates(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function shortLabel(iso: string): string {
  return DAY_LABELS[new Date(iso + "T12:00:00").getDay()];
}

export function useWeeklyReport(intervalMinutes: number): WeeklyReport {
  const [report, setReport] = useState<WeeklyReport>({
    days: [], avgCompliance: 0, bestDay: null, worstDay: null,
    topApps: [], eyeHealthScore: 0, loading: true,
  });

  useEffect(() => {
    async function load() {
      try {
        const db = await getDb();
        const dates = last7Dates();
        const start = dates[0];
        const end = dates[6];

        // daily screen time
        const screenRows = await db.select<{ date: string; total: number }[]>(
          `SELECT date(start_time,'localtime') as date,
                  SUM(duration_seconds) as total
           FROM sessions
           WHERE date(start_time,'localtime') BETWEEN ? AND ?
           GROUP BY date(start_time,'localtime')`,
          [start, end]
        );
        const screenMap = new Map(screenRows.map((r) => [r.date, r.total]));

        // daily breaks taken
        const breakRows = await db.select<{ date: string; cnt: number }[]>(
          `SELECT date, COUNT(*) as cnt
           FROM points_log
           WHERE reason = 'break_taken' AND date BETWEEN ? AND ?
           GROUP BY date`,
          [start, end]
        );
        const breakMap = new Map(breakRows.map((r) => [r.date, r.cnt]));

        // top 5 apps this week
        const appRows = await db.select<{ app_name: string; total: number }[]>(
          `SELECT app_name, SUM(duration_seconds) as total
           FROM sessions
           WHERE date(start_time,'localtime') BETWEEN ? AND ?
           GROUP BY app_name
           ORDER BY total DESC
           LIMIT 5`,
          [start, end]
        );

        const days: DayData[] = dates.map((date) => {
          const screenSec = screenMap.get(date) ?? 0;
          const screenMins = Math.round(screenSec / 60);
          const breaks = breakMap.get(date) ?? 0;
          const expectedBreaks = screenMins > 0
            ? Math.max(1, Math.floor(screenMins / intervalMinutes))
            : 0;
          const compliance = expectedBreaks > 0
            ? Math.min(100, Math.round((breaks / expectedBreaks) * 100))
            : 0;
          return {
            label: shortLabel(date),
            date,
            screenMinutes: screenMins,
            breaks,
            expectedBreaks,
            compliance,
          };
        });

        const activeDays = days.filter((d) => d.screenMinutes > 0);
        const avgCompliance = activeDays.length > 0
          ? Math.round(activeDays.reduce((s, d) => s + d.compliance, 0) / activeDays.length)
          : 0;

        const sorted = [...activeDays].sort((a, b) => b.compliance - a.compliance);
        const bestDay  = sorted[0] ?? null;
        const worstDay = sorted[sorted.length - 1] ?? null;

        const topApps: AppUsage[] = appRows.map((r) => ({
          name: r.app_name,
          minutes: Math.round(r.total / 60),
        }));

        // eye health score: 70% avg compliance + 30% consistency
        const daysWithBreaks = days.filter((d) => d.breaks > 0).length;
        const consistency = (daysWithBreaks / 7) * 100;
        const eyeHealthScore = Math.round(avgCompliance * 0.7 + consistency * 0.3);

        setReport({ days, avgCompliance, bestDay, worstDay, topApps, eyeHealthScore, loading: false });
      } catch (e) {
        console.error("Weekly report load error:", e);
        setReport((r) => ({ ...r, loading: false }));
      }
    }
    load();
  }, [intervalMinutes]);

  return report;
}
