import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
import { isSupabaseConfigured } from "../store/supabase";
import { syncDailyStats } from "../store/sync";
import { fireNotification } from "../hooks/useBreakReminder";
import type { BreakReminderState } from "../hooks/useBreakReminder";
import { type PauseEntry, formatPauseEntry } from "../hooks/useLidState";
import { awardWindDownPoints } from "../store/gamification";
import {
  isSoundEnabled, getSoundVolume,
  setSoundEnabled, setSoundVolume,
  playBell, playSuccess, playLevelUp, playTick,
} from "../store/sound";

const INTERVALS = [15, 20, 25, 30] as const;

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

interface Props {
  intervalMinutes: number;
  onIntervalChange: (mins: number) => void;
  breakState: BreakReminderState;
  onTestOverlay?: () => void;
  pauseLog?: PauseEntry[];
  cameraEnabled?: boolean;
  onCameraToggle?: (val: boolean) => void;
  cameraStream?: MediaStream | null;
  cameraError?: string | null;
  user?: User | null;
  onSignOut?: () => Promise<void>;
  authLoading?: boolean;
  onRequestSignIn?: () => void;
}

export default function SettingsPage({ intervalMinutes, onIntervalChange, breakState, onTestOverlay, pauseLog, cameraEnabled, onCameraToggle, cameraStream, cameraError, user, onSignOut, authLoading, onRequestSignIn }: Props) {
  const { continuousSeconds, nextBreakIn, isIdle } = breakState;
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = cameraStream ?? null;
    }
  }, [cameraStream]);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled);
  const [soundVolume, setSoundVolumeState] = useState(getSoundVolume);

  function handleSoundToggle() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundEnabledState(next);
  }

  function handleVolumeChange(v: number) {
    setSoundVolume(v);
    setSoundVolumeState(v);
  }

  const [autostartEnabled, setAutostartEnabled] = useState<boolean>(true);
  useEffect(() => {
    async function initAutostart() {
      try {
        const initialized = localStorage.getItem("screenwellness.autostartInitialized");
        if (!initialized) {
          await autostartEnable();
          localStorage.setItem("screenwellness.autostartInitialized", "1");
          setAutostartEnabled(true);
        } else {
          setAutostartEnabled(await autostartIsEnabled());
        }
      } catch (e) {
        console.error("autostart init error:", e);
      }
    }
    initAutostart();
  }, []);

  async function handleAutostartToggle() {
    try {
      if (autostartEnabled) {
        await autostartDisable();
        setAutostartEnabled(false);
      } else {
        await autostartEnable();
        setAutostartEnabled(true);
      }
    } catch (e) {
      console.error("autostart toggle error:", e);
    }
  }

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(() => {
    const last = localStorage.getItem("screenwellness.lastSynced");
    return last ? { ok: true, text: `Last synced ${new Date(last).toLocaleString()}` } : null;
  });

  async function handleSyncNow() {
    if (!user) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      await syncDailyStats(user.id);
      const now = new Date().toISOString();
      localStorage.setItem("screenwellness.lastSynced", now);
      setSyncMsg({ ok: true, text: `Synced at ${new Date(now).toLocaleTimeString()}` });
    } catch (e) {
      setSyncMsg({ ok: false, text: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSyncing(false);
    }
  }

  const [windDown, setWindDown] = useState<boolean>(() => {
    const saved = localStorage.getItem("screenwellness.windDownDate");
    return saved === new Date().toISOString().slice(0, 10);
  });

  async function handleWindDown() {
    if (windDown) return;
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem("screenwellness.windDownDate", today);
    setWindDown(true);
    await awardWindDownPoints();
  }
  const thresholdSeconds = intervalMinutes * 60;
  const progress = thresholdSeconds > 0 ? Math.min(continuousSeconds / thresholdSeconds, 1) : 0;

  return (
    <main className="flex-1 h-full overflow-auto p-6 bg-gray-50">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Settings</h2>

      {/* ── break reminder card ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg mb-4">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Break Reminder</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              20-20-20 rule · every X minutes of screen time
            </p>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isIdle
                ? "bg-yellow-100 text-yellow-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {isIdle ? "⏸ Idle" : "▶ Active"}
          </span>
        </div>

        {/* interval picker */}
        <div className="flex gap-2 mt-4">
          {INTERVALS.map((mins) => (
            <button
              key={mins}
              onClick={() => onIntervalChange(mins)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                intervalMinutes === mins
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
              }`}
            >
              {mins}m
            </button>
          ))}
        </div>

        {/* progress bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Screen time</span>
            <span>
              {isIdle ? "Paused — no input detected" : `Next break in ${fmt(nextBreakIn)}`}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${progress * 100}%`,
                background: progress > 0.8 ? "#f59e0b" : "#6366f1",
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-300 mt-1">
            <span>0</span>
            <span>{intervalMinutes}m</span>
          </div>
        </div>
      </div>

      {/* ── wind-down mode ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Wind-Down Mode</h3>
            <p className="text-xs text-gray-400 mt-0.5">Signal you're wrapping up for the day (+20 pts)</p>
          </div>
          <button
            onClick={handleWindDown}
            disabled={windDown}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              windDown
                ? "bg-green-100 text-green-700 cursor-default"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {windDown ? "✓ Active today" : "Activate"}
          </button>
        </div>
      </div>

      {/* ── sound settings ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Sounds</h3>
            <p className="text-xs text-gray-400 mt-0.5">Ticks, bells, chimes &amp; ambient rain</p>
          </div>
          <button
            onClick={handleSoundToggle}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              soundEnabled
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {soundEnabled ? "On" : "Off"}
          </button>
        </div>

        {soundEnabled && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-gray-500 w-14 shrink-0">Volume</span>
              <input
                type="range" min={0} max={100}
                value={Math.round(soundVolume * 100)}
                onChange={(e) => handleVolumeChange(e.target.valueAsNumber / 100)}
                className="flex-1 accent-indigo-600"
              />
              <span className="text-xs text-gray-500 w-8 text-right tabular-nums">
                {Math.round(soundVolume * 100)}%
              </span>
            </div>

            <div className="flex gap-2 flex-wrap">
              {[
                { label: "Bell",     fn: playBell    },
                { label: "Success",  fn: playSuccess },
                { label: "Level-up", fn: playLevelUp },
                { label: "Tick",     fn: playTick    },
              ].map(({ label, fn }) => (
                <button
                  key={label}
                  onClick={() => fn()}
                  className="px-3 py-1 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                >
                  ▶ {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── camera presence detection ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Smart Presence Detection</h3>
            <p className="text-xs text-gray-400 mt-0.5">Pauses tracking when you step away from the camera</p>
          </div>
          <button
            onClick={() => onCameraToggle?.(!cameraEnabled)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              cameraEnabled
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {cameraEnabled ? "On" : "Off"}
          </button>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 mb-3">
          <span className="mt-0.5 text-green-600 shrink-0">🔒</span>
          <p className="text-xs text-green-700">
            Camera is processed locally only. Nothing is recorded or sent anywhere.
          </p>
        </div>

        {cameraEnabled && (
          <div className="flex items-center gap-4">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: 80, height: 60, borderRadius: 6, background: "#000", objectFit: "cover", flexShrink: 0 }}
            />
            <p className="text-xs text-gray-500">
              {cameraError
                ? <span className="text-red-500">Camera error: {cameraError}</span>
                : "Live preview — confirms camera is working"}
            </p>
          </div>
        )}
      </div>

      {/* ── cloud sync ── */}
      {isSupabaseConfigured() && user && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Cloud Sync</h3>
              <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
            </div>
            <button
              onClick={onSignOut}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Log out
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Syncs daily totals (screen time, points, streak) to the cloud. Raw app history stays local only.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            {syncMsg && (
              <span className={`text-xs ${syncMsg.ok ? "text-green-600" : "text-red-500"}`}>
                {syncMsg.text}
              </span>
            )}
          </div>
        </div>
      )}
      {isSupabaseConfigured() && !user && !authLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg mb-4">
          <h3 className="text-sm font-semibold text-gray-800">Cloud Sync</h3>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            Optional. Sign in to back up daily totals (screen time, points, streak). Raw app history always stays on this PC.
          </p>
          <button
            onClick={onRequestSignIn}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Sign in / Sign up
          </button>
        </div>
      )}

      {/* ── start with windows ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Start with Windows</h3>
            <p className="text-xs text-gray-400 mt-0.5">Launch automatically when you log in</p>
          </div>
          <button
            onClick={handleAutostartToggle}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              autostartEnabled
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {autostartEnabled ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* ── test buttons ── */}
      <div className="max-w-lg mb-4 flex gap-3">
        {onTestOverlay && (
          <button
            onClick={onTestOverlay}
            className="flex-1 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            Test break overlay
          </button>
        )}
        <button
          onClick={async () => {
            setNotifError(null);
            try {
              await fireNotification(
                "👁 Eye Break",
                "Look 20 feet away for 20 seconds — your eyes will thank you."
              );
            } catch (e) {
              setNotifError(String(e));
            }
          }}
          className="flex-1 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          Test notification
        </button>
      </div>

      {notifError && (
        <div className="max-w-lg mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs font-semibold text-red-700 mb-1">Notification error</p>
          <p className="text-xs text-red-600 font-mono break-all">{notifError}</p>
        </div>
      )}

      {/* ── lid / sleep log ── */}
      {pauseLog && pauseLog.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 max-w-lg mb-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Lid / Sleep Log</h3>
          <div className="space-y-2">
            {pauseLog.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 text-xs text-gray-600">
                <span className="text-yellow-500 mt-0.5 shrink-0">⏸</span>
                <span>{formatPauseEntry(entry)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── info card ── */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 max-w-lg">
        <p className="text-xs text-indigo-700 leading-relaxed">
          <strong>How it works:</strong> The timer only runs while you're actively
          using the machine. Walk away for 2+ minutes and it resets — no
          reminders for idle time. Closing the lid also pauses the timer.
        </p>
      </div>
    </main>
  );
}
