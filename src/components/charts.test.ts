import { describe, expect, it } from 'vitest'
import { dailyBars, windowDays } from './charts'

describe('windowDays', () => {
  // The server's window is "today in Taipei and the 29 days before"; the chart must use the same days.
  it('ends on the Taipei date of the snapshot, even when UTC is still on the day before', () => {
    const days = windowDays(Date.UTC(2026, 10, 14, 17, 0), 30) // 01:00 on Nov 15 in Taipei
    expect(days).toHaveLength(30)
    expect(days[29]).toBe('2026-11-15')
    expect(days[0]).toBe('2026-10-17')
  })

  it('crosses month ends without skipping or repeating a day', () => {
    const days = windowDays(Date.UTC(2026, 2, 2, 4), 4)
    expect(days).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'])
  })
})

describe('dailyBars', () => {
  const lights = { green: 0.5, yellow: 0.25, red: 0.25 }
  const trend = [
    { day: '2026-11-13', isp: 'cht', n: 40, domestic: 0.5, lights },
    { day: '2026-11-13', isp: 'twm', n: 9, domestic: 1, lights: { green: 1, yellow: 0, red: 0 } },
    { day: '2026-11-15', isp: 'cht', n: 3, domestic: 0.5, lights },
  ]

  // A day the trend does not list had no tests: it must stay a visible gap, not vanish from the axis.
  it('keeps one bar per window day and marks days without tests', () => {
    const bars = dailyBars(trend, 'cht', ['2026-11-13', '2026-11-14', '2026-11-15'])
    expect(bars).toEqual([
      { day: '2026-11-13', n: 40, lights },
      { day: '2026-11-14', n: 0, lights: null },
      { day: '2026-11-15', n: 3, lights },
    ])
  })

  it('never mixes in another ISP', () => {
    const bars = dailyBars(trend, 'twm', ['2026-11-13', '2026-11-15'])
    expect(bars.map((b) => b.n)).toEqual([9, 0])
  })
})
