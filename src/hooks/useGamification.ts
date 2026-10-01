import { useCallback, useEffect, useState } from "react";
import {
  getGamificationState,
  checkEarlyBird,
  checkRecreationalTimeBonus,
} from "../store/gamification";
import type { GamificationState } from "../store/gamification";

const EMPTY: GamificationState = { todayPoints: 0, streak: 0, badges: [] };

export function useGamification(refreshMs = 15_000) {
  const [state, setState] = useState<GamificationState>(EMPTY);

  const refresh = useCallback(async () => {
    try {
      setState(await getGamificationState());
    } catch (e) {
      console.error("Gamification fetch error:", e);
    }
  }, []);

  useEffect(() => {
    // startup side-effects
    checkEarlyBird().catch(console.error);
    checkRecreationalTimeBonus().catch(console.error);
    refresh();

    const id = setInterval(() => {
      checkRecreationalTimeBonus().catch(console.error);
      refresh();
    }, refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  return { ...state, refresh };
}
