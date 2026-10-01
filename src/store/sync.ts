import { supabase } from "./supabase";
import { getDb } from "./db";

export async function syncDailyStats(userId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");

  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const screenRows = await db.select<{ date: string; total: number }[]>(
    `SELECT date(start_time,'localtime') as date, SUM(duration_seconds) as total
     FROM sessions
     WHERE date(start_time,'localtime') BETWEEN ? AND ?
     GROUP BY date(start_time,'localtime')`,
    [thirtyDaysAgo, today]
  );

  const pointsRows = await db.select<{ date: string; total: number }[]>(
    `SELECT date, SUM(points) as total
     FROM points_log
     WHERE date BETWEEN ? AND ?
     GROUP BY date`,
    [thirtyDaysAgo, today]
  );

  const streakRows = await db.select<{ current_streak: number }[]>(
    `SELECT current_streak FROM streak WHERE id = 1`
  );
  const streakCount = streakRows[0]?.current_streak ?? 0;

  const screenMap = new Map(screenRows.map(r => [r.date, Math.round(r.total / 60)]));
  const pointsMap = new Map(pointsRows.map(r => [r.date, r.total]));

  const allDates = new Set([...screenMap.keys(), ...pointsMap.keys()]);
  if (allDates.size === 0) return;

  const rows = Array.from(allDates).map(date => ({
    user_id: userId,
    date,
    screen_minutes: screenMap.get(date) ?? 0,
    points_earned: pointsMap.get(date) ?? 0,
    streak_count: date === today ? streakCount : 0,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("user_daily_stats")
    .upsert(rows, { onConflict: "user_id,date" });

  if (error) throw new Error(error.message);
}
