/**
 * A distance as a big figure, shared by the result card and the share image. Five digits do not
 * fit the figure's box, so from 10,000 km on it reads in thousands with one decimal (10,781 →
 * 10.8k), rounded half up; below that it keeps its thousands separator (3,230). zh-TW and en-US
 * group digits the same way, so the figure needs no language.
 */
export function kmFigure(km: number): string {
  const whole = Math.round(km)
  if (whole < 10_000) return whole.toLocaleString('en-US')
  // Whole hundreds first, so the decimal is exact and .05 rounds up, not to the nearest binary float.
  return `${(Math.round(whole / 100) / 10).toFixed(1)}k`
}
