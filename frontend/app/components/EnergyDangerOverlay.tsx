"use client";

import { useGameStore } from "../lib/store/gameStore";

// Mirrors the energy gain/loss math in backend/game/energy.go, so this only
// lights up when the server itself is actually draining you -- not just
// whenever energy happens to be low (e.g. right after a dash burns a chunk of
// it while you're still parked in the sun's gain zone and about to recover).
const SUN_START_RADIUS = 300; // backend/game/sun.go SunStartRadius
const NEUTRAL_ENERGY_DISTANCE = 750; // backend/game/game.go NeutralEnergyDistance
const LOW_ENERGY_THRESHOLD = 100;

function radiusForSizeLevel(level: number): number {
  switch (level) {
    case 5:
      return 40;
    case 4:
      return 34;
    case 3:
      return 28;
    case 2:
      return 22;
    default:
      return 16;
  }
}

/**
 * Full-screen danger banner for low energy while actually losing it (too far
 * from the sun). Plain React/CSS overlay (like HowToPlayOverlay) rather than a
 * Pixi effect -- it's pure screen-space chrome with no game-world coordinates
 * to track, so CSS animations are the simpler tool here.
 */
export default function EnergyDangerOverlay() {
  const isDead = useGameStore((state) => state.isDead);
  const sunScale = useGameStore((state) => state.sunScale);
  const player = useGameStore((state) =>
    state.localPlayerId !== null ? state.players[state.localPlayerId] : undefined
  );

  let isCritical = false;
  if (!isDead && player && player.energy < LOW_ENERGY_THRESHOLD) {
    const sunRadius = sunScale * SUN_START_RADIUS;
    const distanceToSunCenter = Math.hypot(player.x, player.y);
    const distanceFromSunSurface = distanceToSunCenter - sunRadius - radiusForSizeLevel(player.size);
    isCritical = distanceFromSunSurface > NEUTRAL_ENERGY_DISTANCE;
  }

  if (!isCritical) return null;

  const stripes =
    "[background:repeating-linear-gradient(135deg,rgba(220,38,38,0.55)_0px,rgba(220,38,38,0.55)_16px,transparent_16px,transparent_32px)]";

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <div className="absolute inset-0 animate-[energy-danger-flash_2.8s_ease-in-out_infinite] bg-red-600" />

      <div className={`absolute inset-x-0 top-0 h-6 opacity-80 md:h-8 ${stripes}`} />
      <div className={`absolute inset-x-0 bottom-0 h-6 opacity-80 md:h-8 ${stripes}`} />
      <div className={`absolute inset-y-0 left-0 w-6 opacity-80 md:w-8 ${stripes}`} />
      <div className={`absolute inset-y-0 right-0 w-6 opacity-80 md:w-8 ${stripes}`} />

      <div className="absolute inset-x-0 top-10 flex justify-center px-6 md:top-14">
        <div className="text-center">
          <p className="text-lg font-bold tracking-wide text-red-500 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)] md:text-2xl">
            ENERGY CRITICAL
          </p>
          <p className="mt-1 text-sm text-red-300/90 drop-shadow-[0_0_6px_rgba(0,0,0,0.8)] md:text-base">
            Get near the sun to recharge before you run out.
          </p>
        </div>
      </div>
    </div>
  );
}
