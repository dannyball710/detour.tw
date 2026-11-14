// The card's look: a boarding pass on a cyanotype chart, written as plain SVG.
// Layout and sizes live here, colours and fonts are tokens in ./theme.ts. Everything else in
// src/server/og is pipeline (data, map geometry, fonts, wasm, caching).
import type { Light } from '#/lib/types'
import type { CardCopy } from './copy'
import type { MapLayer, Rect } from './map'
import { fitLines, truncate } from './text'
import { CHART, LIGHT, PAPER } from './theme'
import type { TextStyle, Typesetter } from './typeset'

export type Layout = 'wide' | 'story'

export const SIZES: Record<Layout, { width: number; height: number }> = {
  wide: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
}

/** Area the map zooms to fit (user and landing colo), in canvas pixels. */
export const FOCUS: Record<Layout, Rect> = {
  wide: { x: 630, y: 30, w: 550, h: 540 },
  story: { x: 40, y: 230, w: 1000, h: 450 },
}

/** The pass: position, perforation offset from its top, corner radius, notch radius. */
const PASS: Record<Layout, Rect & { perf: number; radius: number; notch: number }> = {
  wide: { x: 36, y: 36, w: 560, h: 558, perf: 450, radius: 28, notch: 16 },
  story: { x: 60, y: 710, w: 960, h: 830, perf: 666, radius: 40, notch: 24 },
}

// Type scale per layout (px). Story is the same pass at ~1.6×.
const SCALE = {
  wide: { pad: 32, icon: 32, status: 21, verdict: 34, note: 16, code: 76, codeName: 17, label: 13, figure: 100, unit: 20, stubValue: 17, mapLabel: 20, site: 22 },
  story: { pad: 52, icon: 52, status: 34, verdict: 50, note: 28, code: 112, codeName: 28, label: 20, figure: 150, unit: 34, stubValue: 28, mapLabel: 30, site: 34 },
}

/** Line height (× size) for single-line text boxes. */
const LINE = 1.3

const f = (n: number) => Math.round(n * 100) / 100

// 24×24 status glyphs (white on the light's paper tone): check, bent arrow, plane, question, pin.
const PLANE = 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z'
const STROKE = 'fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"'
const ICON: Record<Light, string> = {
  green: `<path d="M6 12.5l4 4 8-9" ${STROKE} stroke-width="2.6"/>`,
  yellow: `<path d="M6 18v-6a4 4 0 0 1 4-4h8M14.5 4.5L18 8l-3.5 3.5" ${STROKE} stroke-width="2.4"/>`,
  red: `<path d="${PLANE}" fill="#fff" transform="rotate(45 12 12) translate(2.4 2.4) scale(0.8)"/>`,
  gray: `<path d="M9.2 9.2a2.9 2.9 0 1 1 4.1 2.6c-.8.4-1.3 1-1.3 1.9v.6M12 17.6v.1" ${STROKE} stroke-width="2.4"/>`,
  blue: `<path d="M12 20.5s-5.5-5.2-5.5-9.5a5.5 5.5 0 0 1 11 0c0 4.3-5.5 9.5-5.5 9.5zM12 9.3v3.4" ${STROKE} stroke-width="2.4"/>`,
}

/** A 24×24 glyph scaled to `size` and centred on (cx, cy). */
function glyph(inner: string, cx: number, cy: number, size: number): string {
  return `<g transform="translate(${f(cx - size / 2)} ${f(cy - size / 2)}) scale(${f(size / 24)})">${inner}</g>`
}

/** White card whose perforation notches are real cut-outs (the chart shows through), plus the dashes. */
function passShape(layout: Layout): string {
  const { width: W, height: H } = SIZES[layout]
  const p = PASS[layout]
  const py = p.y + p.perf
  return (
    `<defs><mask id="pass" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">` +
    `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.radius}" fill="#fff"/>` +
    `<circle cx="${p.x}" cy="${py}" r="${p.notch}" fill="#000"/>` +
    `<circle cx="${p.x + p.w}" cy="${py}" r="${p.notch}" fill="#000"/></mask></defs>` +
    `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.radius}" fill="${PAPER.card}" mask="url(#pass)"/>` +
    `<path d="M${p.x + p.notch + 14},${py}H${p.x + p.w - p.notch - 14}" stroke="${PAPER.rule}" stroke-width="2" stroke-dasharray="9 8"/>`
  )
}

function pass(layout: Layout, copy: CardCopy, ts: Typesetter): string {
  const p = PASS[layout]
  const s = SCALE[layout]
  const left = p.x + s.pad
  const inner = p.w - 2 * s.pad
  const right = left + inner
  const tone = LIGHT[copy.light].paper
  const out: string[] = [passShape(layout)]

  const status: TextStyle = { role: 'body', weight: 700, size: s.status, fill: tone }
  const verdictBase = { role: 'body' as const, weight: 900 }
  const noteBase = { role: 'body' as const, weight: 500 }
  // Notes (VPN, roaming, foreign SIM) can run long, e.g. the site's foreign-SIM sentence: up to two lines.
  const noteFit = copy.note ? fitLines(copy.note, inner, s.note, s.note * 0.85, 2, ts.measurer(noteBase)) : null
  const note: TextStyle = { ...noteBase, size: noteFit?.size ?? s.note, fill: PAPER.graphite }
  const noteH = noteFit ? s.note * 0.25 + noteFit.lines.length * noteFit.size * LINE : 0
  const code = (size: number): TextStyle => ({ role: 'figure', weight: 800, size, fill: PAPER.ink, tracking: 0.01 })
  const codeName: TextStyle = { role: 'body', weight: 500, size: s.codeName, fill: PAPER.graphite }
  const label: TextStyle = { role: 'mono', weight: 400, size: s.label, fill: PAPER.graphite, tracking: 0.06 }
  const unit: TextStyle = { role: 'body', weight: 500, size: s.unit, fill: PAPER.graphite }

  // Figures share one size: the largest at which every stat (figure + unit) fits side by side.
  const statGap = s.pad * 1.2
  const unitGap = s.unit * 0.3
  const unitsW = copy.stats.reduce((w, st) => w + ts.width(st.unit, unit) + unitGap, 0)
  const figureEm = copy.stats.reduce((w, st) => w + ts.width(st.value, { ...code(1), tracking: 0 }), 0)
  const figureSize = Math.floor(Math.min(s.figure, (inner - unitsW - statGap * (copy.stats.length - 1)) / figureEm))
  const figure: TextStyle = { role: 'figure', weight: 800, size: figureSize, fill: PAPER.ink }

  // Three blocks spread over the area above the perforation: header, route, figures.
  const top = p.y + s.pad * 0.9
  const bottom = p.y + p.perf - s.pad * 0.75
  const routeH = s.code * 0.92 + s.codeName * (0.3 + LINE)
  const statsH = s.label * LINE + figureSize * 0.95
  // Two-line verdict plus a note can crowd the blocks together; the verdict gives up size first.
  let verdict = { size: 0, lines: [] as string[] }
  let headerH = 0
  let gap = 0
  for (let max = s.verdict; ; max -= 1) {
    verdict = fitLines(copy.verdict, inner, max, s.verdict * 0.75, 2, ts.measurer(verdictBase))
    headerH = s.icon + s.pad * 0.4 + verdict.lines.length * verdict.size * 1.22 + noteH
    gap = Math.max(0, (bottom - top - headerH - routeH - statsH) / 2)
    if (gap >= s.pad * 0.5 || max <= s.verdict * 0.75) break
  }
  const verdictStyle: TextStyle = { ...verdictBase, size: verdict.size, fill: PAPER.ink }

  // Header: status icon + word, verdict, optional note.
  let y = top
  const iconCy = y + s.icon / 2
  out.push(
    `<circle cx="${f(left + s.icon / 2)}" cy="${f(iconCy)}" r="${f(s.icon / 2)}" fill="${tone}"/>`,
    glyph(ICON[copy.light], left + s.icon / 2, iconCy, s.icon * 0.66),
    ts.text(copy.status, left + s.icon * 1.32, ts.centred(copy.status, status, iconCy), status),
  )
  y += s.icon + s.pad * 0.4
  for (const line of verdict.lines) {
    out.push(ts.text(line, left, ts.baseline(line, verdictStyle, y, 1.22), verdictStyle))
    y += verdict.size * 1.22
  }
  if (noteFit) {
    y += s.note * 0.25
    for (const line of noteFit.lines) {
      out.push(ts.text(line, left, ts.baseline(line, note, y, LINE), note))
      y += noteFit.size * LINE
    }
  }

  // Route: origin ──✈── landing.
  y = top + headerH + gap
  const codeStyle = code(s.code)
  const nameY = y + s.code * 0.92 + s.codeName * 0.3
  out.push(
    ts.text(copy.origin.code, left, ts.baseline(copy.origin.code, codeStyle, y, 0.92), codeStyle),
    ts.text(copy.landing.code, right, ts.baseline(copy.landing.code, codeStyle, y, 0.92), { ...codeStyle, anchor: 'end' }),
    ts.text(copy.origin.name, left, ts.baseline(copy.origin.name, codeName, nameY, LINE), codeName),
    ts.text(copy.landing.name, right, ts.baseline(copy.landing.name, codeName, nameY, LINE), { ...codeName, anchor: 'end' }),
  )
  const lineY = y + (s.code * 0.92) / 2
  const x1 = left + ts.width(copy.origin.code, codeStyle) + s.pad * 0.5
  const x2 = right - ts.width(copy.landing.code, codeStyle) - s.pad * 0.5
  const plane = s.code * 0.36
  const planeX = (x1 + x2) / 2
  const rule = `stroke="${PAPER.ink}" stroke-opacity="0.35" stroke-width="2"`
  out.push(
    `<path d="M${f(x1)},${f(lineY)}H${f(planeX - plane / 2 - s.pad * 0.25)}M${f(planeX + plane / 2 + s.pad * 0.25)},${f(lineY)}H${f(x2)}" ${rule}/>`,
    glyph(`<path d="${PLANE}" fill="${tone}" transform="rotate(90 12 12)"/>`, planeX, lineY, plane),
  )

  // Figures, bottom-aligned above the perforation; units sit on the figure's baseline.
  y = bottom - statsH
  let x = left
  for (const st of copy.stats) {
    const figureW = ts.width(st.value, figure)
    const base = ts.baseline(st.value, figure, y + s.label * LINE, 0.95)
    out.push(
      ts.text(st.label, x, ts.baseline(st.label, label, y, LINE), label),
      ts.text(st.value, x, base, figure),
      ts.text(st.unit, x + figureW + unitGap, base, unit),
    )
    x += Math.max(ts.width(st.label, label), figureW + unitGap + ts.width(st.unit, unit)) + statGap
  }

  // Stub: network · from · date. If the row runs long the network name shrinks a little, then
  // gives way with an ellipsis.
  const sy = p.y + p.perf + s.pad * 0.85
  const valueY = sy + s.label * (LINE + 0.35)
  const body: TextStyle = { role: 'body', weight: 500, size: s.stubValue, fill: PAPER.ink }
  const date: TextStyle = { role: 'mono', weight: 700, size: s.stubValue, fill: PAPER.ink, tracking: 0.04 }
  const stubGap = s.pad * 0.8
  const colW = (i: number, value: string, style: TextStyle) =>
    Math.max(ts.width(copy.stub[i].label, label), ts.width(value, style))
  const room = inner - colW(1, copy.stub[1].value, body) - colW(2, copy.stub[2].value, date) - 2 * stubGap
  const network: TextStyle = {
    ...body,
    size: Math.max(s.stubValue * 0.82, Math.min(s.stubValue, (s.stubValue * room) / ts.width(copy.stub[0].value, body))),
  }
  const styles = [network, body, date]
  const values = copy.stub.map((field, i) =>
    i === 0 ? truncate(field.value, room, (t) => ts.width(t, network)) : field.value,
  )
  x = left
  copy.stub.forEach((field, i) => {
    out.push(
      ts.text(field.label, x, ts.baseline(field.label, label, sy, LINE), label),
      ts.text(values[i], x, ts.baseline(values[i], styles[i], valueY, LINE), styles[i]),
    )
    x += colW(i, values[i], styles[i]) + stubGap
  })

  return out.join('')
}

function mapLabels(copy: CardCopy, map: MapLayer, size: number, ts: Typesetter): string {
  const out: string[] = []
  // No coordinates for the colo means no marker on the chart, so nothing to label.
  if (!map.landing) return ''
  const { x, y } = map.landing
  const r = map.landingRadius
  const code: TextStyle = { role: 'mono', weight: 700, size, fill: LIGHT[copy.light].sea, tracking: 0.06 }
  const mid = ts.centred(copy.landing.code, code, y)
  if (map.landingLabel === 'above') {
    out.push(ts.text(copy.landing.code, x, y - r - size * 0.5, { ...code, anchor: 'middle' }))
  } else if (map.landingLabel === 'left') {
    out.push(ts.text(copy.landing.code, x - r - 12, mid, { ...code, anchor: 'end' }))
  } else {
    out.push(ts.text(copy.landing.code, x + r + 12, mid, code))
  }
  return out.join('')
}

/** Everything drawn over the chart: the pass, chart labels, the site name and (story) the CTA. */
export function card(layout: Layout, copy: CardCopy, map: MapLayer, ts: Typesetter): string {
  const { width: W, height: H } = SIZES[layout]
  const s = SCALE[layout]
  const site: TextStyle = { role: 'mono', weight: 700, size: s.site, fill: CHART.mark, tracking: 0.06 }
  const out = [mapLabels(copy, map, s.mapLabel, ts), pass(layout, copy, ts)]

  if (layout === 'wide') {
    out.push(ts.text(copy.site, W - 36, H - 30 - s.site * 0.25, { ...site, anchor: 'end' }))
    return out.join('')
  }

  // Story: Instagram/Threads cover roughly the top and bottom 250 px with their own UI, so the
  // pass and the CTA sit between those bands.
  out.push(ts.text(copy.site, 60, ts.baseline(copy.site, site, 110, 1.2), site))
  const p = PASS.story
  const ctaTop = p.y + p.h + 32
  const ctaH = 100
  const cy = ctaTop + ctaH / 2
  const cta: TextStyle = { role: 'body', weight: 700, size: 40, fill: PAPER.ink }
  const arrow: TextStyle = { role: 'mono', weight: 700, size: 40, fill: PAPER.ink, tracking: 0.04 }
  const arrowText = `→ ${copy.site}`
  const w1 = ts.width(copy.cta, cta)
  const w2 = ts.width(arrowText, arrow)
  const start = p.x + (p.w - (w1 + 22 + w2)) / 2
  out.push(
    `<rect x="${p.x}" y="${ctaTop}" width="${p.w}" height="${ctaH}" rx="${ctaH / 2}" fill="${PAPER.card}"/>`,
    ts.text(copy.cta, start, ts.centred(copy.cta, cta, cy), cta),
    ts.text(arrowText, start + w1 + 22, ts.centred(arrowText, arrow, cy), arrow),
  )
  return out.join('')
}
