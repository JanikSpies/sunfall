"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "../lib/store/gameStore";
import { DeathReason } from "../lib/models/WebSocketTypes";

const REASON_TEXT: Record<DeathReason, string> = {
  [DeathReason.SUN]: "Consumed by the sun",
  [DeathReason.BLACK_HOLE]: "Lost to the black hole",
  [DeathReason.ENERGY_DEPLETION]: "Ran out of energy",
};

function formatSurvived(seconds: number | null): string {
  if (seconds === null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Full-screen death screen, plain React/Tailwind over the Pixi canvas --
 * same pattern as <HowToPlayOverlay>/<EnergyDangerOverlay>, not a Pixi
 * screen, since this is pure chrome (text, stats, a button) with nothing
 * tied to game-world coordinates.
 *
 * Revealed a beat after the death animation starts (see
 * MainScreen.handleDeathState) rather than immediately, so the explosion is
 * still visible for a moment first. Stays up until the player clicks
 * through -- "Respawn" reconnects in place (MainScreen.respawnLocal) and
 * "Back to Title" leaves the match (MainScreen.leaveMatch); both need the
 * live Pixi screen instance, so this component only sets a request flag on
 * the store and lets MainScreen's subscription do the actual work.
 */
export default function DeathScreen() {
  const showDeathScreen = useGameStore((state) => state.showDeathScreen);
  const deathStats = useGameStore((state) => state.deathStats);
  const [respawning, setRespawning] = useState(false);

  // DeathScreen never unmounts (it's always in the tree, just rendering null
  // while hidden -- see page.tsx), so local state has to be reset explicitly
  // whenever a new death screen comes up, rather than relying on remount.
  useEffect(() => {
    if (showDeathScreen) setRespawning(false);
  }, [showDeathScreen]);

  if (!showDeathScreen || !deathStats) return null;

  const handleRespawn = () => {
    setRespawning(true);
    useGameStore.getState().requestRespawn();
  };

  const handleBackToTitle = () => {
    useGameStore.getState().requestReturnToTitle();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-black/90 px-6 text-white animate-[death-screen-in_0.4s_ease-out]">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-5xl font-bold tracking-wide text-red-500 drop-shadow-[0_0_12px_rgba(220,38,38,0.7)] md:text-6xl">
          YOU DIED
        </h1>
        <p className="text-base text-red-300/90 md:text-lg">
          {REASON_TEXT[deathStats.reason] ?? "Your ship was destroyed"}
        </p>
      </div>

      <div className="flex w-full max-w-xs gap-4 md:max-w-sm">
        <div className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-4">
          <span className="text-xs uppercase tracking-wider text-white/50">Score</span>
          <span className="text-2xl font-bold tabular-nums text-yellow-400 md:text-3xl">
            {Math.round(deathStats.peakEnergy)}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-4">
          <span className="text-xs uppercase tracking-wider text-white/50">Survived</span>
          <span className="text-2xl font-bold tabular-nums text-sky-400 md:text-3xl">
            {formatSurvived(deathStats.survivedSeconds)}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleRespawn}
          disabled={respawning}
          className="rounded-full bg-sky-400 px-12 py-3 text-lg font-bold text-zinc-900 transition-colors hover:bg-sky-300 active:scale-95 disabled:pointer-events-none disabled:opacity-60"
        >
          {respawning ? "Respawning..." : "Respawn"}
        </button>

        <button
          onClick={handleBackToTitle}
          className="text-sm font-semibold text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
        >
          Back to Title
        </button>
      </div>
    </div>
  );
}
