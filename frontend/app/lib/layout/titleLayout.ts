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

// Mobile: the game content (logo/name/play) needs to center in the band left
// between the top records card and the bottom leaderboard card, not the full
// viewport height -- otherwise it drifts toward whichever card is shorter,
// and on a short viewport it can overlap them outright. TitleStatsPanel
// measures the cards' real rendered height and reports it into the store;
// these are just the pre-measurement defaults for the first paint.
export const MOBILE_CARD_MARGIN = 16;
export const MOBILE_DEFAULT_TOP_RESERVED = 190;
export const MOBILE_DEFAULT_BOTTOM_RESERVED = 220;
export const MOBILE_MIN_AVAILABLE_HEIGHT = 160;
// A big leaderboard (or a tall on-screen keyboard/browser chrome eating into
// real viewport height) can push the available band down a lot -- shrinking
// proportionally to that forever ends in an illegibly tiny logo/input/button.
// Past this point it's better to let the panel crowd the title content a
// little than to keep shrinking it into unreadability.
export const MOBILE_MIN_COMPRESSION = 0.72;
// The leaderboard is capped shorter on mobile than desktop specifically to
// keep the bottom card's natural height down -- less reserved space needed
// means less compression needed in the first place.
export const MOBILE_LEADERBOARD_SIZE = 4;

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
