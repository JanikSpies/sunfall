"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "../lib/store/gameStore";

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2.5c2.5 1.8 4 5 4 8.5 0 1.7-.4 3.2-1 4.5l1.8 1.8-.7 2.5-2.7-1.3c-.5.3-1 .5-1.4.6v2.4h-2v-2.4c-.4-.1-.9-.3-1.4-.6l-2.7 1.3-.7-2.5L7 15.5c-.6-1.3-1-2.8-1-4.5 0-3.5 1.5-6.7 4-8.5 .7-.5 1.3-.5 2 0Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="12" width="4" height="8" rx="1" fill="currentColor" />
      <rect x="10" y="7" width="4" height="13" rx="1" fill="currentColor" />
      <rect x="16" y="3" width="4" height="17" rx="1" fill="currentColor" />
    </svg>
  );
}

const TABS = [
  { id: "play" as const, label: "Play", Icon: RocketIcon },
  { id: "stats" as const, label: "Stats", Icon: BarChartIcon },
];

/**
 * Bottom tab bar shown only on mobile's title screen (md:hidden, gated on
 * onTitleScreen) -- Clash Royale-style: two tabs, an animated pill slides
 * between them. Swaps <TitleStatsPanel>'s records/leaderboard cards on and
 * off screen instead of stacking them above/below the title content, which
 * used to eat most of the vertical space on a phone (see StartScreen.resize's
 * old titleCardReserved band-centering).
 *
 * Reports its own rendered height (which varies with the safe-area inset on
 * notched phones) into the store so StartScreen can reserve exactly that
 * much space, same pattern TitleStatsPanel used for its cards.
 */
export default function MobileTabBar() {
  const onTitleScreen = useGameStore((state) => state.onTitleScreen);
  const activeTab = useGameStore((state) => state.activeMobileTab);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onTitleScreen || !barRef.current) return;
    const el = barRef.current;
    const report = () => useGameStore.getState().setTitleCardReserved(el.offsetHeight);
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, [onTitleScreen]);

  // Reset to the Play tab whenever the title screen comes back up (e.g.
  // after a match) so a player doesn't land back on the Stats tab with no
  // obvious way to see the play button.
  useEffect(() => {
    if (onTitleScreen) useGameStore.getState().setActiveMobileTab("play");
  }, [onTitleScreen]);

  if (!onTitleScreen) return null;

  const activeIndex = TABS.findIndex((tab) => tab.id === activeTab);

  return (
    <div
      ref={barRef}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
    >
      <div className="relative mx-auto flex max-w-sm px-3 pt-2">
        <div
          className="absolute inset-y-2 w-[calc(50%-0.375rem)] rounded-xl bg-zinc-800/80 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {TABS.map(({ id, label, Icon }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              type="button"
              onClick={() => useGameStore.getState().setActiveMobileTab(id)}
              className="relative z-10 flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors"
            >
              <Icon
                className={`h-6 w-6 transition-colors ${isActive ? "text-orange-500" : "text-zinc-500"}`}
              />
              <span
                className={`text-[11px] font-bold tracking-wide transition-colors ${isActive ? "text-orange-500" : "text-zinc-500"}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
