import { describe, expect, it, vi } from 'vitest'
import { distanceToColoKm } from '#/lib/geo'
import type { SubmitRequest } from '#/lib/types'
import { classify, publicCoords, serverViewFromCf, softFlags, type ServerView } from './classify'
import { COUNTY_SEATS } from './county'
import { evaluate } from './submit'

// The hosting list is curated separately; pin one ASN so the VPN rule is testable regardless of its contents.
vi.mock('#/data/isps', async (orig) => ({
  ...(await orig<typeof import('#/data/isps')>()),
  isHostingAsn: (asn: number | null | undefined) => asn === 16509,
}))

const NOW = Date.UTC(2026, 10, 14, 4, 0)

const taipei: ServerView = {
  ip: '203.0.113.7',
  colo: 'LAX',
  country: 'TW',
  regionCode: 'TPE',
  region: 'Taipei City',
  lat: 25.03,
  lon: 121.56,
  asn: 3462,
  asOrganization: 'Chunghwa Telecom',
  rtt: null,
}

const ref = (over: Partial<NonNullable<SubmitRequest['ref']>> = {}): NonNullable<SubmitRequest['ref']> => ({
  colo: 'TPE',
  ip: '203.0.113.7',
  ts: NOW / 1000,
  loc: 'TW',
  warp: 'off',
  gateway: 'off',
  rtts: [8, 9, 10],
  ...over,
})

function body(over: Partial<SubmitRequest> = {}): SubmitRequest {
  return {
    token: 't',
    own: { colo: 'LAX', rtts: [140, 150, 160, 150, 155] },
    ref: ref(),
    tz: 'Asia/Taipei',
    deviceId: 'device-0123456789',
    contribute: true,
    conn: 'wifi',
    lang: 'zh',
    ...over,
  }
}

// Each row of the brief's 例外狀況 table: only "in Taiwan, on a Taiwanese network" may enter the Taiwan stats,
// otherwise the ISPs can dismiss the numbers as polluted.
describe('classification (brief 例外狀況 table)', () => {
  const cases: {
    name: string
    view: Partial<ServerView>
    body: Partial<SubmitRequest>
    category: string
    light: string
    eligible: boolean
  }[] = [
    { name: 'in Taiwan, HiNet, lands in LAX', view: {}, body: {}, category: 'tw', light: 'red', eligible: true },
    {
      name: 'in Taiwan, lands in Taipei',
      view: { colo: 'TPE' },
      body: { own: { colo: 'TPE', rtts: [8, 9, 10] } },
      category: 'tw',
      light: 'green',
      eligible: true,
    },
    {
      name: 'in Taiwan, lands in Hong Kong',
      view: { colo: 'HKG' },
      body: { own: { colo: 'HKG', rtts: [30, 32, 35] } },
      category: 'tw',
      light: 'yellow',
      eligible: true,
    },
    {
      name: 'abroad on a local network',
      view: { country: 'JP', regionCode: '13', lat: 35.68, lon: 139.69, asn: 2516, colo: 'NRT' },
      body: { own: { colo: 'NRT', rtts: [5, 6, 7] }, tz: 'Asia/Tokyo', ref: ref({ colo: 'NRT', loc: 'JP', rtts: [5, 6, 7] }) },
      category: 'intl',
      light: 'blue',
      eligible: false,
    },
    {
      name: 'Taiwanese SIM roaming abroad (TW IP, foreign timezone)',
      view: {},
      body: { tz: 'America/Los_Angeles' },
      category: 'roaming',
      light: 'red',
      eligible: false,
    },
    {
      name: 'in Taiwan on a foreign eSIM (foreign IP, Taipei timezone)',
      view: { country: 'HK', regionCode: null, lat: 22.32, lon: 114.17, asn: 4760, colo: 'HKG' },
      body: { own: { colo: 'HKG', rtts: [30, 32, 35] }, ref: ref({ colo: 'HKG', loc: 'HK', rtts: [30, 31, 33] }) },
      category: 'foreign-sim',
      light: 'blue',
      eligible: false,
    },
    { name: 'VPN / hosting ASN', view: { asn: 16509 }, body: {}, category: 'vpn', light: 'gray', eligible: false },
    { name: 'Cloudflare WARP', view: {}, body: { ref: ref({ warp: 'plus' }) }, category: 'vpn', light: 'gray', eligible: false },
    { name: 'Zero Trust gateway', view: {}, body: { ref: ref({ gateway: 'on' }) }, category: 'vpn', light: 'gray', eligible: false },
    { name: 'Tor exit (T1)', view: { country: 'T1' }, body: { ref: ref({ loc: 'T1' }) }, category: 'vpn', light: 'gray', eligible: false },
    {
      name: 'opted out of contributing',
      view: {},
      body: { contribute: false },
      category: 'tw',
      light: 'red',
      eligible: false,
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const ev = evaluate(body(c.body), { ...taipei, ...c.view }, NOW)
      expect(ev.row.flags).toBeNull()
      expect(ev.row.category).toBe(c.category)
      expect(ev.row.light).toBe(c.light)
      expect(ev.eligible).toBe(c.eligible)
    })
  }

  it('VPN wins over every other rule', () => {
    expect(classify({ asn: 16509, country: 'JP', tz: 'Asia/Tokyo', ref: null, landingColo: 'NRT' }).category).toBe('vpn')
  })
})

describe('derived values', () => {
  it('extra km is landing distance minus reference distance, and RTTs are medians', () => {
    const ev = evaluate(body(), taipei, NOW)
    expect(ev.row.rtt_ms).toBe(150)
    expect(ev.row.ref_rtt_ms).toBe(9)
    expect(ev.row.distance_km).toBeGreaterThan(10_000)
    const seat = COUNTY_SEATS.TPE
    expect(ev.row.extra_km).toBe(ev.row.distance_km! - distanceToColoKm(seat.lat, seat.lon, 'TPE')!)
    expect(ev.row.isp_key).toBe('cht')
  })
})

// A fabricated submission must not silently enter the stats; these are physical / cross-checked impossibilities.
describe('soft anti-abuse checks', () => {
  const flags = (view: Partial<ServerView>, b: Partial<SubmitRequest>) => evaluate(body(b), { ...taipei, ...view }, NOW).row.flags

  it('rtt-physics: 20 ms from Taipei to Los Angeles is faster than light in fibre', () => {
    expect(flags({}, { own: { colo: 'LAX', rtts: [20, 20, 20] } })).toBe('rtt-physics')
  })

  it('rtt-physics: 130 ms to Los Angeles is plausible', () => {
    expect(flags({}, { own: { colo: 'LAX', rtts: [130, 130, 130] } })).toBeNull()
  })

  it('rtt-physics also applies to the reference path', () => {
    expect(flags({}, { ref: ref({ colo: 'LAX', rtts: [20, 20, 20] }) })).toBe('rtt-physics')
  })

  it('rtt-server: client claims far less than the TCP handshake we observed', () => {
    expect(flags({ rtt: 160 }, { own: { colo: 'LAX', rtts: [130, 130, 130] } })).toBeNull()
    expect(flags({ rtt: 600 }, { own: { colo: 'LAX', rtts: [130, 130, 130] } })).toBe('rtt-server')
  })

  it('rtt-server: client claims far more than the handshake (inflating the detour)', () => {
    expect(flags({ colo: 'TPE', rtt: 10 }, { own: { colo: 'TPE', rtts: [300, 300, 300] } })).toBe('rtt-server')
  })

  it('rtt-server: an honest spike (radio wake-up, Wi-Fi power save) is tolerated', () => {
    // 20 ms handshake, 150 ms median: flagged under the old 3x+50 band, fine under 5x+150.
    expect(flags({ colo: 'TPE', rtt: 20 }, { own: { colo: 'TPE', rtts: [150, 150, 150] } })).toBeNull()
  })

  it('own-colo: a landing colo missing from COLOS is kept out of the stats rather than shown as red', () => {
    expect(flags({ colo: 'QQQ' }, { own: { colo: 'QQQ', rtts: [10, 10, 10] } })).toBe('own-colo')
  })

  it('ref-ip: same family but different address means the ref trace came from elsewhere', () => {
    expect(flags({}, { ref: ref({ ip: '198.51.100.1' }) })).toBe('ref-ip')
  })

  it('ref-ip: IPv4 page request vs IPv6 ref trace is normal dual-stack, not suspicious', () => {
    expect(flags({}, { ref: ref({ ip: '2001:db8::1' }) })).toBeNull()
    expect(flags({ ip: '2001:db8::1' }, { ref: ref({ ip: '2001:DB8::1' }) })).toBeNull()
  })

  it('ref-ip / ref-loc are skipped only when explicitly asked (dev loopback)', () => {
    const b = body({ ref: ref({ ip: '198.51.100.1', loc: 'US' }) })
    expect(evaluate(b, taipei, NOW).row.flags).toBe('ref-ip,ref-loc')
    expect(evaluate(b, { ...taipei, ip: '127.0.0.1' }, NOW, true).row.flags).toBeNull()
  })

  it('ref-ts: a replayed trace older than 3 minutes', () => {
    expect(flags({}, { ref: ref({ ts: NOW / 1000 - 600 }) })).toBe('ref-ts')
  })

  it('ref-colo: unknown colo code', () => {
    expect(flags({}, { ref: ref({ colo: 'ZZZ' }) })).toBe('ref-colo')
  })

  it('flagged tw tests are not eligible for counting', () => {
    expect(evaluate(body({ own: { colo: 'LAX', rtts: [20, 20, 20] } }), taipei, NOW).eligible).toBe(false)
  })

  it('no ref trace: only own-path checks run', () => {
    expect(softFlags({ view: taipei, now: NOW, ownColo: 'LAX', ownMedian: 150, ref: null, refMedian: null })).toEqual([])
  })
})

describe('serverViewFromCf', () => {
  // The real request.cf seen in dev from a HiNet line: province-level regionCode "04", city "Taipei".
  const hinet = {
    colo: 'TPE',
    country: 'TW',
    city: 'Taipei',
    region: 'Taiwan',
    regionCode: '04',
    latitude: '25.05306',
    longitude: '121.52639',
    asn: 3462,
    clientTcpRtt: 0,
    clientQuicRtt: 12,
  } as unknown as IncomingRequestCfProperties

  it('derives the county for Taiwan, keeps raw coords for distances, prefers TCP RTT then QUIC', () => {
    const v = serverViewFromCf('1.1.1.1', hinet)
    expect(v).toMatchObject({ regionCode: 'TPE', lat: 25.05306, lon: 121.52639, rtt: 12, asn: 3462, country: 'TW' })
  })

  it('keeps Cloudflare subdivision codes outside Taiwan', () => {
    const v = serverViewFromCf('1.1.1.1', { ...hinet, country: 'JP', regionCode: '13', city: 'Tokyo' })
    expect(v.regionCode).toBe('13')
  })

  it('tolerates a missing cf object', () => {
    expect(serverViewFromCf('1.1.1.1', undefined)).toMatchObject({ colo: null, country: null, lat: null, rtt: null })
  })
})

// Privacy promise: 「位置只到縣市」. Nothing finer than a county may be stored or published.
describe('publicCoords', () => {
  it('Taiwan: county seat when the county is known', () => {
    expect(publicCoords({ ...taipei, lat: 25.05306, lon: 121.52639 })).toEqual(COUNTY_SEATS.TPE)
  })

  it('Taiwan: nothing when the county is unknown', () => {
    expect(publicCoords({ ...taipei, regionCode: null })).toEqual({ lat: null, lon: null })
  })

  it('elsewhere: whole degrees', () => {
    expect(publicCoords({ ...taipei, country: 'JP', lat: 35.6895, lon: 139.6917 })).toEqual({ lat: 36, lon: 140 })
    expect(publicCoords({ ...taipei, country: 'GB', lat: 51.5, lon: -0.12 })).toEqual({ lat: 52, lon: 0 })
  })

  // Two exact distances to two public colo locations would pinpoint the raw geo-IP point.
  it('stored coords and all published distances come from the coarse point', () => {
    const ev = evaluate(body(), { ...taipei, lat: 25.05306, lon: 121.52639 }, NOW)
    const seat = COUNTY_SEATS.TPE
    expect({ lat: ev.row.lat, lon: ev.row.lon }).toEqual(seat)
    expect(ev.row.distance_km).toBe(distanceToColoKm(seat.lat, seat.lon, 'LAX'))
    expect(ev.row.ref_distance_km).toBe(distanceToColoKm(seat.lat, seat.lon, 'TPE'))
  })

  it('unknown Taiwanese county: no coords and no distances', () => {
    const ev = evaluate(body(), { ...taipei, regionCode: null }, NOW)
    expect(ev.row).toMatchObject({ lat: null, lon: null, distance_km: null, ref_distance_km: null, extra_km: null })
  })

  it('abroad: distances from whole-degree coords', () => {
    const view = { ...taipei, country: 'JP', lat: 35.6895, lon: 139.6917, colo: 'NRT' }
    const ev = evaluate(body({ tz: 'Asia/Tokyo', own: { colo: 'NRT', rtts: [5, 6, 7] }, ref: null }), view, NOW)
    expect(ev.row.distance_km).toBe(distanceToColoKm(36, 140, 'NRT'))
  })

  it('the physics check still uses the raw point', () => {
    // Raw point is Taipei; the county is unknown so there is no public point, yet 20 ms to LAX is still caught.
    const ev = evaluate(body({ own: { colo: 'LAX', rtts: [20, 20, 20] } }), { ...taipei, regionCode: null }, NOW)
    expect(ev.row.flags).toBe('rtt-physics')
  })
})
