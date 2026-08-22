export function getResolution(): number {
  if (typeof window === "undefined") {
    return 1;
  }
  return Math.min(window.devicePixelRatio || 1, 2);
}
