"use client";

import { useEffect, useRef, useState } from "react";
import { engine } from "../getEngine";
import { getClientId, useGameStore } from "../lib/store/gameStore";
import {
  DESKTOP_COMPOSITION_WIDTH,
  DESKTOP_PADDING,
  DESKTOP_PANEL_WIDTH,
  formatStat,
  MOBILE_LEADERBOARD_SIZE,
} from "../lib/layout/titleLayout";

interface LeaderboardEntry {
  rank: number;
  name: string;
  total_energy: number;
  is_you: boolean;
}

interface PlayerStats {
  total_energy: number;
  kd: number;
  leaderboard: LeaderboardEntry[];
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 17l6-6 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="3" y="12" width="4" height="9" />
      <rect x="10" y="7" width="4" height="14" />
      <rect x="17" y="3" width="4" height="18" />
    </svg>
  );
}

// Left accent bar on the top 3 leaderboard rows -- everything past that is
// unranked-looking on purpose, matching the reference design.
const RANK_ACCENTS = ["border-orange-500", "border-sky-400", "border-amber-700"];

function Stat({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: "orange" | "sky";
}) {
  const pct = Math.max(4, Math.min(100, (value / max) * 100));
  const textColor = color === "orange" ? "text-orange-500" : "text-sky-400";
  const barColor = color === "orange" ? "bg-orange-500" : "bg-sky-400";

  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[11px] font-semibold tracking-wider text-zinc-400">{label}</p>
      <p className={`truncate text-3xl font-bold tabular-nums ${textColor}`}>{formatStat(value)}</p>
      <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RecordsCard({ stats }: { stats: PlayerStats }) {
  // No natural ceiling for either stat -- energy is scaled against the
  // current top score so the bar reads as "progress toward #1", K/D against a
  // fixed 3.0 as a reasonable "very good" ceiling for a bar, not a real cap.
  const energyMax = Math.max(stats.leaderboard[0]?.total_energy ?? 1, stats.total_energy, 1);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/85 p-5 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-zinc-300">
        <TrendUpIcon className="h-4 w-4 shrink-0" />
        <h3 className="text-xs font-bold tracking-widest">YOUR RECORDS</h3>
      </div>
      <div className="mt-4 flex gap-6">
        <Stat label="TOTAL ENERGY" value={stats.total_energy} max={energyMax} color="orange" />
        <Stat label="K/D" value={stats.kd} max={3} color="sky" />
      </div>
    </div>
  );
}

function LeaderboardCard({ leaderboard }: { leaderboard: LeaderboardEntry[] }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/85 p-5 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-zinc-300">
        <BarChartIcon className="h-4 w-4 shrink-0" />
        <h3 className="text-xs font-bold tracking-widest">TOP HARVESTERS</h3>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {leaderboard.map((entry) => (
          <div
            key={entry.rank}
            className={`flex items-center justify-between rounded-lg border-l-2 bg-zinc-900/70 py-2 pl-3 pr-3 ${
              RANK_ACCENTS[entry.rank - 1] ?? "border-transparent"
            } ${entry.is_you ? "ring-1 ring-orange-500/60" : ""}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-4 shrink-0 text-sm text-zinc-500">{entry.rank}</span>
              <span className="truncate text-sm font-semibold text-zinc-100">{entry.name}</span>
              {entry.is_you && (
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
                  YOU
                </span>
              )}
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-sky-400">
              {formatStat(entry.total_energy)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Title-screen stats: your all-time energy/K-D plus the top-6 leaderboard,
 * keyed by the same localStorage client_id the analytics pipeline already
 * uses -- no account needed. Plain React/CSS over the Pixi canvas, same
 * pattern as HowToPlayOverlay.
 *
 * Desktop and mobile both need to agree with StartScreen.ts (the Pixi title
 * content) about how much space this panel takes up, or the two layers drift
 * apart / overlap:
 *  - Desktop: positioned using the exact same capped-composition-width math
 *    as StartScreen's resize(), from the shared titleLayout constants, so
 *    the gap between the game content and this panel never grows past a
 *    fixed point no matter how wide the window gets.
 *  - Mobile: this panel's own cards' *real* rendered height is measured via
 *    ResizeObserver and reported into titleCardReserved so StartScreen can
 *    center its content in the band actually left between them, then forces
 *    a Pixi resize so that takes effect immediately instead of waiting for
 *    the next window resize.
 */
export default function TitleStatsPanel() {
  const onTitleScreen = useGameStore((state) => state.onTitleScreen);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onTitleScreen) return;

    let cancelled = false;
    fetch(`/admin/stats/?client_id=${encodeURIComponent(getClientId())}`)
      .then((res) => res.json())
      .then((data: PlayerStats) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        // Best-effort stat panel -- a failed fetch just means nothing renders.
      });

    return () => {
      cancelled = true;
    };
  }, [onTitleScreen]);

  useEffect(() => {
    if (!stats || !topRef.current || !bottomRef.current) return;

    const report = () => {
      useGameStore.getState().setTitleCardReserved(topRef.current?.offsetHeight ?? 0, bottomRef.current?.offsetHeight ?? 0);
      try {
        engine().resize();
      } catch {
        // Engine not mounted yet -- the next natural window resize (or the
        // next time this effect re-runs) will pick up the real measurement.
      }
    };

    const observer = new ResizeObserver(report);
    observer.observe(topRef.current);
    observer.observe(bottomRef.current);
    report();

    return () => observer.disconnect();
  }, [stats]);

  if (!onTitleScreen || !stats) return null;

  return (
    <>
      <div
        className="pointer-events-none fixed top-1/2 z-10 hidden w-[380px] -translate-y-1/2 flex-col gap-4 md:flex"
        style={{
          right: `calc(max(0px, (100vw - ${DESKTOP_COMPOSITION_WIDTH}px) / 2) + ${DESKTOP_PADDING}px)`,
          width: DESKTOP_PANEL_WIDTH,
        }}
      >
        <RecordsCard stats={stats} />
        <LeaderboardCard leaderboard={stats.leaderboard} />
      </div>

      <div ref={topRef} className="pointer-events-none fixed inset-x-0 top-4 z-10 mx-auto max-w-sm px-4 md:hidden">
        <RecordsCard stats={stats} />
      </div>
      <div ref={bottomRef} className="pointer-events-none fixed inset-x-0 bottom-4 z-10 mx-auto max-w-sm px-4 md:hidden">
        {/* Shorter than the desktop panel's list on purpose -- keeps this
            card's natural height down so the title content above doesn't
            need to compress as much to fit in the space left for it. */}
        <LeaderboardCard leaderboard={stats.leaderboard.slice(0, MOBILE_LEADERBOARD_SIZE)} />
      </div>
    </>
  );
}
