import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { awardBreakPoints, deductPoints, getGamificationState } from "../store/gamification";
import { playBell, startAmbientRain } from "../store/sound";

const BREAK_DURATION = 20;
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  onDismiss: () => void;
}

export default function BreakOverlay({ onDismiss }: Props) {
  const [timeLeft, setTimeLeft] = useState(BREAK_DURATION);
  const [phase, setPhase] = useState<"countdown" | "celebration">("countdown");
  const [todayPoints, setTodayPoints] = useState(0);
  const [dotX, setDotX] = useState(0);
  const [dotY, setDotY] = useState(0);
  const animRef = useRef<number>(0);
  const startRef = useRef(Date.now());
  const dismissedRef = useRef(false);

  // bell + ambient rain + always-on-top + focus
  useEffect(() => {
    playBell();
    const stopRain = startAmbientRain();
    invoke("set_always_on_top", { value: true }).catch(console.error);
    invoke("focus_main_window").catch(console.error);
    getGamificationState()
      .then((s) => setTodayPoints(Math.max(0, s.todayPoints)))
      .catch(console.error);
    return () => {
      stopRain();
      invoke("set_always_on_top", { value: false }).catch(console.error);
    };
  }, []);

  // figure-8 lemniscate animation
  useEffect(() => {
    function tick() {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const t = (elapsed / 6) * 2 * Math.PI;
      const denom = 1 + Math.sin(t) ** 2;
      setDotX((Math.cos(t) / denom) * 88);
      setDotY((Math.sin(t) * Math.cos(t) / denom) * 44);
      animRef.current = requestAnimationFrame(tick);
    }
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // countdown
  useEffect(() => {
    if (phase !== "countdown") return;
    if (timeLeft <= 0) {
      setPhase("celebration");
      awardBreakPoints().catch(console.error);
      setTimeout(() => {
        if (!dismissedRef.current) {
          dismissedRef.current = true;
          onDismiss();
        }
      }, 2000);
      return;
    }
    const id = setTimeout(() => setTimeLeft((t: number) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft, phase, onDismiss]);

  const handleComplete = useCallback(async () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    await awardBreakPoints().catch(console.error);
    onDismiss();
  }, [onDismiss]);

  const handleSkip = useCallback(async () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    await deductPoints("skip_break", 5).catch(console.error);
    onDismiss();
  }, [onDismiss]);

  const dashOffset = CIRCUMFERENCE * (timeLeft / BREAK_DURATION);

  return (
    <>
      <style>{`
        @keyframes sw-breathe {
          0%,100% { transform:scale(1); opacity:0.35; }
          50% { transform:scale(1.45); opacity:0.65; }
        }
        @keyframes sw-fadein {
          from { opacity:0; transform:scale(0.94); }
          to   { opacity:1; transform:scale(1); }
        }
        @keyframes sw-pop {
          0%   { transform:scale(0.7); opacity:0; }
          60%  { transform:scale(1.12); opacity:1; }
          100% { transform:scale(1); }
        }
        @keyframes sw-pulse-ring {
          0%   { transform:scale(1); opacity:0.6; }
          100% { transform:scale(1.6); opacity:0; }
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "rgba(0,0,0,0.88)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {phase === "celebration" ? (
          <div style={{ textAlign: "center", animation: "sw-pop 0.5s ease-out both" }}>
            <div style={{ fontSize: 72, lineHeight: 1 }}>✅</div>
            <p style={{ color: "#fff", fontSize: 28, fontWeight: 700, marginTop: 20 }}>Well done!</p>
            <p style={{ color: "#a5b4fc", fontSize: 22, marginTop: 8 }}>+10 pts</p>
          </div>
        ) : (
          <div
            style={{
              background: "rgba(15,23,42,0.96)",
              border: "1px solid rgba(99,102,241,0.35)",
              borderRadius: 24,
              padding: "40px 48px",
              width: 460,
              textAlign: "center",
              animation: "sw-fadein 0.3s ease-out both",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.1)",
            }}
          >
            {/* header */}
            <p style={{ color: "#818cf8", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
              Eye Break Time
            </p>
            <p style={{ color: "#f1f5f9", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              Look at something 20 feet away
            </p>
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 32 }}>
              Follow the dot with your eyes
            </p>

            {/* figure-8 eye tracking area */}
            <div
              style={{
                position: "relative",
                width: 260,
                height: 110,
                margin: "0 auto 32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* breathing glow */}
              <div
                style={{
                  position: "absolute",
                  width: 90,
                  height: 90,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0) 70%)",
                  animation: "sw-breathe 4s ease-in-out infinite",
                }}
              />
              {/* pulse ring */}
              <div
                style={{
                  position: "absolute",
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "2px solid rgba(129,140,248,0.5)",
                  transform: `translate(${dotX}px, ${dotY}px)`,
                  animation: "sw-pulse-ring 1.2s ease-out infinite",
                }}
              />
              {/* main dot */}
              <div
                style={{
                  position: "absolute",
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#818cf8",
                  boxShadow: "0 0 14px #818cf8, 0 0 28px rgba(129,140,248,0.4)",
                  transform: `translate(${dotX}px, ${dotY}px)`,
                }}
              />
            </div>

            {/* circular countdown */}
            <div style={{ position: "relative", width: 128, height: 128, margin: "0 auto 24px" }}>
              <svg width="128" height="128" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="64" cy="64" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
                <circle
                  cx="64" cy="64" r={RADIUS}
                  fill="none"
                  stroke={timeLeft <= 5 ? "#f59e0b" : "#6366f1"}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#f1f5f9", fontSize: 34, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{timeLeft}</span>
                <span style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>seconds</span>
              </div>
            </div>

            {/* points info */}
            <div
              style={{
                background: "rgba(99,102,241,0.1)",
                border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 12,
                padding: "10px 20px",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Today: {todayPoints} pts</span>
              <span style={{ color: "#334155", fontSize: 13 }}>·</span>
              <span style={{ color: "#6ee7b7", fontSize: 13, fontWeight: 600 }}>Complete for +10 pts</span>
            </div>

            {/* break complete button */}
            <button
              onClick={handleComplete}
              style={{
                width: "100%",
                padding: "13px 0",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 14,
                boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#4f46e5"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "#6366f1"; }}
            >
              Break Complete ✓
            </button>

            {/* skip */}
            <button
              onClick={handleSkip}
              style={{ background: "none", border: "none", color: "#475569", fontSize: 12, cursor: "pointer", padding: "4px 12px" }}
            >
              Skip &nbsp;<span style={{ color: "#ef4444" }}>−5 pts</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}
