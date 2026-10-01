import { getDb } from "./db";
import { playSuccess, playLevelUp } from "./sound";

export type BadgeId = "first_break" | "streak_7" | "early_bird";

export interface Badge {
  id: BadgeId;
  label: string;
  description: string;
  icon: string;
  earnedAt: string | null;
}

export interface GamificationState {
  todayPoints: number;
  streak: number;
  badges: Badge[];
}

const BADGE_META: Record<BadgeId, { label: string; description: string; icon: string }> = {
  first_break: { label: "First Break",  description: "Took your first eye break",     icon: "👁"  },
  streak_7:    { label: "7-Day Streak", description: "Earned points 7 days in a row", icon: "🔥" },
  early_bird:  { label: "Early Bird",   description: "Used the app before 9am",        icon: "🌅" },
};

// non-work keywords (inverse of work list)
const WORK_KEYWORDS = [
  "code", "visual studio", "cursor", "intellij", "webstorm", "rider",
  "chrome", "firefox", "edge", "msedge", "brave", "safari",
  "terminal", "windowsterminal", "powershell", "pwsh", "cmd", "bash",
  "node", "cargo", "git", "python",
  "teams", "slack", "zoom", "outlook", "word", "excel", "powerpoint",
  "notion", "obsidian", "figma",
];

function isWork(name: string): boolean {
  const l = name.toLowerCase();
  return WORK_KEYWORDS.some((k) => l.includes(k));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── internal: check & update streak after any points change ──────────────────
async function checkAndUpdateStreak(): Promise<void> {
  const db = await getDb();
  const date = today();

  const [{ total }] = await db.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(points), 0) as total FROM points_log WHERE date = ?",
    [date]
  );
  if (total < 30) return;

  const rows = await db.select<{ current_streak: number; last_earned_date: string }[]>(
    "SELECT current_streak, last_earned_date FROM streak WHERE id = 1"
  );

  if (rows.length === 0) {
    await db.execute(
      "INSERT INTO streak (id, current_streak, last_earned_date) VALUES (1, 1, ?)",
      [date]
    );
    return;
  }

  const { current_streak, last_earned_date } = rows[0];
  if (last_earned_date === date) return; // already counted today

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const newStreak = last_earned_date === yesterday ? current_streak + 1 : 1;

  await db.execute(
    "UPDATE streak SET current_streak = ?, last_earned_date = ? WHERE id = 1",
    [newStreak, date]
  );

  if (newStreak >= 7) {
    await earnBadge("streak_7");
  }
}

// ── public: award points for a break (multiple per day OK) ───────────────────
export async function awardBreakPoints(): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO points_log (date, reason, points, created_at) VALUES (?, 'break_taken', 10, datetime('now'))",
    [today()]
  );
  playSuccess();
  await earnBadge("first_break");
  await checkAndUpdateStreak();
}

// ── public: award wind-down points (once per day) ────────────────────────────
export async function awardWindDownPoints(): Promise<void> {
  const db = await getDb();
  const date = today();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM points_log WHERE date = ? AND reason = 'wind_down'",
    [date]
  );
  if (count > 0) return;
  await db.execute(
    "INSERT INTO points_log (date, reason, points, created_at) VALUES (?, 'wind_down', 20, datetime('now'))",
    [date]
  );
  playSuccess();
  await checkAndUpdateStreak();
}

// ── public: check recreational time bonus (once per day) ─────────────────────
export async function checkRecreationalTimeBonus(): Promise<void> {
  const db = await getDb();
  const date = today();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM points_log WHERE date = ? AND reason = 'recreational_limit'",
    [date]
  );
  if (count > 0) return;

  const rows = await db.select<{ app_name: string; total: number }[]>(
    "SELECT app_name, SUM(duration_seconds) as total FROM sessions WHERE date(start_time, 'localtime') = ? GROUP BY app_name",
    [date]
  );

  const recSeconds = rows
    .filter((r) => !isWork(r.app_name))
    .reduce((s, r) => s + r.total, 0);

  if (recSeconds > 0 && recSeconds < 7_200) {
    await db.execute(
      "INSERT INTO points_log (date, reason, points, created_at) VALUES (?, 'recreational_limit', 30, datetime('now'))",
      [date]
    );
    playSuccess();
    await checkAndUpdateStreak();
  }
}

// ── public: deduct points (skip penalty) ─────────────────────────────────────
export async function deductPoints(reason: string, amount: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO points_log (date, reason, points, created_at) VALUES (?, ?, ?, datetime('now'))",
    [today(), reason, -amount]
  );
}

// ── public: earn a badge (idempotent) ────────────────────────────────────────
export async function earnBadge(id: BadgeId): Promise<void> {
  const db = await getDb();
  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM badges WHERE id = ?",
    [id]
  );
  if (count > 0) return;
  await db.execute(
    "INSERT INTO badges (id, earned_at) VALUES (?, datetime('now'))",
    [id]
  );
  playLevelUp();
}

// ── public: check early-bird badge ───────────────────────────────────────────
export async function checkEarlyBird(): Promise<void> {
  if (new Date().getHours() < 9) {
    await earnBadge("early_bird");
  }
}

// ── public: read current state ────────────────────────────────────────────────
export async function getGamificationState(): Promise<GamificationState> {
  const db = await getDb();
  const date = today();

  const [{ total }] = await db.select<{ total: number }[]>(
    "SELECT COALESCE(SUM(points), 0) as total FROM points_log WHERE date = ?",
    [date]
  );

  const streakRows = await db.select<{ current_streak: number }[]>(
    "SELECT current_streak FROM streak WHERE id = 1"
  );
  const streak = streakRows[0]?.current_streak ?? 0;

  const earned = await db.select<{ id: string; earned_at: string }[]>(
    "SELECT id, earned_at FROM badges"
  );
  const earnedMap = new Map(earned.map((b) => [b.id, b.earned_at]));

  const badges: Badge[] = (
    Object.entries(BADGE_META) as [BadgeId, (typeof BADGE_META)[BadgeId]][]
  ).map(([id, meta]) => ({ id, ...meta, earnedAt: earnedMap.get(id) ?? null }));

  return { todayPoints: total, streak, badges };
}
