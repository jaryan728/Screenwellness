import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import SettingsPage from "./components/SettingsPage";
import ReportPage from "./pages/ReportPage";
import AuthPage from "./pages/AuthPage";
import BreakOverlay from "./components/BreakOverlay";
import { useBreakReminder } from "./hooks/useBreakReminder";
import { useLidState } from "./hooks/useLidState";
import { useCameraPresence } from "./hooks/useCameraPresence";
import { useAuth } from "./hooks/useAuth";
import { isSupabaseConfigured } from "./store/supabase";
import { syncDailyStats } from "./store/sync";

type Page = "dashboard" | "settings" | "report";

function App() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();

  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [showBreakOverlay, setShowBreakOverlay] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(() => {
    const saved = localStorage.getItem("screenwellness.breakInterval");
    return saved ? parseInt(saved, 10) : 20;
  });

  const { isPaused: lidIsPaused, pauseLog } = useLidState();
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(
    () => localStorage.getItem("screenwellness.cameraPresence") === "true"
  );
  const { isActive: cameraActive, isPaused: cameraIsPaused, stream: cameraStream, error: cameraError } =
    useCameraPresence(cameraEnabled);

  const combinedIsPaused = lidIsPaused || cameraIsPaused;
  const pauseReason: "lid" | "camera" | undefined = lidIsPaused ? "lid" : cameraIsPaused ? "camera" : undefined;

  function handleCameraToggle(val: boolean) {
    setCameraEnabled(val);
    localStorage.setItem("screenwellness.cameraPresence", String(val));
  }

  const handleBreakDue = useCallback(async () => {
    await invoke("focus_main_window").catch(console.error);
    setShowBreakOverlay(true);
  }, []);
  const breakState = useBreakReminder(intervalMinutes, handleBreakDue, combinedIsPaused);

  function handleIntervalChange(mins: number) {
    setIntervalMinutes(mins);
    localStorage.setItem("screenwellness.breakInterval", String(mins));
  }

  // midnight auto-sync
  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    let t: ReturnType<typeof setTimeout>;

    function schedule() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 5, 0);
      t = setTimeout(async () => {
        try {
          await syncDailyStats(userId);
          localStorage.setItem("screenwellness.lastSynced", new Date().toISOString());
        } catch (e) {
          console.error("midnight sync failed:", e);
        }
        schedule();
      }, midnight.getTime() - now.getTime());
    }

    schedule();
    return () => clearTimeout(t);
  }, [user]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} isPaused={combinedIsPaused} pauseReason={pauseReason} cameraActive={cameraActive} />
      {currentPage === "dashboard" ? (
        <MainContent />
      ) : currentPage === "report" ? (
        <ReportPage intervalMinutes={intervalMinutes} />
      ) : (
        <SettingsPage
          intervalMinutes={intervalMinutes}
          onIntervalChange={handleIntervalChange}
          breakState={breakState}
          onTestOverlay={() => setShowBreakOverlay(true)}
          pauseLog={pauseLog}
          cameraEnabled={cameraEnabled}
          onCameraToggle={handleCameraToggle}
          cameraStream={cameraStream}
          cameraError={cameraError}
          user={user}
          authLoading={authLoading}
          onSignOut={signOut}
          onRequestSignIn={() => setShowAuth(true)}
        />
      )}
      {showAuth && !user && isSupabaseConfigured() && (
        <AuthPage onSignIn={signIn} onSignUp={signUp} onClose={() => setShowAuth(false)} />
      )}
      {showBreakOverlay && (
        <BreakOverlay onDismiss={() => setShowBreakOverlay(false)} />
      )}
    </div>
  );
}

export default App;
