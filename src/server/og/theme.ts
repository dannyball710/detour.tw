import type { Light } from '#/lib/types'
import type { FontSpec } from './fonts'

// Design tokens: a cyanotype chart (two inks) with colour reserved for the lights.
export const CHART = {
  sea: '#0E3B63',
  land: '#1B4F7E',
  coast: 'rgba(255, 255, 255, 0.28)',
  grid: 'rgba(255, 255, 255, 0.07)',
  /** Labels and the origin marker on the chart. */
  mark: '#FFFFFF',
}

export const PAPER = {
  card: '#FFFFFF',
  ink: '#0C1B2A',
  graphite: '#51616F',
  /** Perforation dashes between the pass and its stub. */
  rule: 'rgba(12, 27, 42, 0.22)',
}

/** Each light has a tone for use on the dark sea and one for use on paper. */
export const LIGHT: Record<Light, { sea: string; paper: string }> = {
  green: { sea: '#56D99A', paper: '#0B7F4D' },
  yellow: { sea: '#FFC247', paper: '#9A5B00' },
  red: { sea: '#FF8672', paper: '#C8321F' },
  gray: { sea: '#B4C0CC', paper: '#55626F' },
  blue: { sea: '#86C4FF', paper: '#1A66C2' },
}

/** Figures and airport/county codes. */
export const FIGURE_FAMILY = 'Fira Sans Extra Condensed'
/** Small labels, dates, URL, chart labels; tracked +0.06em. */
export const MONO_FAMILY = 'B612 Mono'
/** Body text (CJK and English). */
export const BODY_FAMILY = 'Noto Sans TC'

/**
 * Google Fonts families/weights fetched (subset to the card's glyphs) for every render.
 * Any Google family works; weights not listed fall back to the nearest one.
 */
export const FONTS: FontSpec[] = [
  { family: FIGURE_FAMILY, weights: [800] },
  { family: MONO_FAMILY, weights: [400, 700] },
  { family: BODY_FAMILY, weights: [500, 700, 900] },
]
