// Shared between StartScreen.ts (Pixi) and TitleStatsPanel.tsx (React/CSS) --
// both layers position independently around the same screen, so the numbers
// have to agree or one drifts out of sync with the other.

// Matches Tailwind's default `md` breakpoint: below this, the stats panel
// stacks above/below the title content instead of sitting beside it.
export const DESKTOP_BREAKPOINT = 768;

// Desktop: caps how far apart the game column and the stats panel can drift
// on an ultra-wide screen. Above this total width, the whole two-column
// composition just stays centered instead of the panel chasing the right
// edge outward -- "close together no matter how far you extend the viewport."
export const DESKTOP_COMPOSITION_WIDTH = 1100;
export const DESKTOP_PANEL_WIDTH = 380;
export const DESKTOP_GAP = 56;
export const DESKTOP_PADDING = 32;

// Mobile: records/leaderboard live behind the "Stats" tab (see MobileTabBar)
// instead of stacking cards above/below the title content, so the game
// content (logo/name/play) only has to reserve room for the tab bar itself
// at the bottom of the viewport.
export const MOBILE_TAB_BAR_HEIGHT = 76;
export const MOBILE_CONTENT_MARGIN = 24;
export const MOBILE_CONTENT_SIDE_MARGIN = 24;
export const MOBILE_MIN_AVAILABLE_HEIGHT = 160;
// The engine renders at a minimum internal resolution (see resizeOptions in
// GameCanvas) and scales that down to fit the real screen -- on phones that
// downscale is much more aggressive than on desktop, so a layout sized 1:1
// like desktop's ends up tiny. This is a fixed target, not a "fill whatever
// room is available" factor -- letting the logo/input/button balloon to fill
// the whole freed-up mobile screen read as too big with no breathing room.
export const MOBILE_BASE_SCALE = 1.7;
// The leaderboard is capped shorter on mobile than desktop specifically to
// keep the "Stats" tab's list from needing its own internal scroll on small
// screens.
export const MOBILE_LEADERBOARD_SIZE = 6;

// Large totals (this is meant to keep growing) would otherwise blow past
// the width these cards are designed for -- compact notation past 100k
// (e.g. "1.2M") keeps the number on one line.
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatStat(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 100_000) {
    return compactFormatter.format(rounded);
  }
  return rounded.toLocaleString("en-US");
}

// K/D is a ratio, not a count -- rounding it to a whole number the way
// formatStat does for energy collapses almost every real value (anything
// under 1.5) down to a flat 0 or 1, which is most of the actual range this
// stat covers. Two decimal places instead.
export function formatKD(value: number): string {
  return value.toFixed(2);
}
