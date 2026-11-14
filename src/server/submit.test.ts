import { beforeEach, describe, expect, it } from 'vitest'
import type { SubmitRequest } from '#/lib/types'
import { serverViewFromCf, visitorOf, type ServerView } from './classify'
import { MAX_COUNTED_PER_IP_PER_DAY, parseSubmit, processSubmit } from './submit'
import { COUNTY_SEATS } from './county'
import { ipKey } from './http'
import { findResult } from './results'
import { createFakeD1 } from './testing/fake-d1'
import { createToken } from './token'

const SECRET = 'test-secret'
const T0 = Date.UTC(2026, 10, 14, 4, 0)

const view: ServerView = {
  ip: '203.0.113.7',
  colo: 'LAX',
  country: 'TW',
  regionCode: 'TPE',
  region: 'Taipei City',
  lat: 25.03,
  lon: 121.56,
  asn: 3462,
  asOrganization: 'Chunghwa Telecom',
  rtt: 140,
}

let db: ReturnType<typeof createFakeD1>

beforeEach(() => {
  db = createFakeD1()
})

const countRows = () => (db.sqlite.prepare('SELECT COUNT(*) AS n FROM tests').get() as { n: number }).n

async function submit(over: Partial<SubmitRequest> = {}, opts: { view?: Partial<ServerView>; age?: number; token?: string } = {}) {
  const v = { ...view, ...opts.view }
  const token = opts.token ?? (await createToken(SECRET, ipKey(v.ip), 'LAX', T0))
  const body: SubmitRequest = {
    token,
    own: { colo: 'LAX', rtts: [140, 150, 160] },
    ref: { colo: 'TPE', ip: v.ip, ts: T0 / 1000, loc: 'TW', warp: 'off', gateway: 'off', rtts: [8, 9, 10] },
    tz: 'Asia/Taipei',
    deviceId: 'device-aaaaaaaaaaaa',
    contribute: true,
    conn: 'wifi',
    lang: 'zh',
    ...over,
  }
  return processSubmit(body, v, { db: db.d1, secret: SECRET, now: T0 + (opts.age ?? 5_000) })
}

// Hard failures reject the request outright: these are the cheap ways to fabricate or replay a test.
describe('hard validation', () => {
  it('accepts a normal test and stores it as counted', async () => {
    const r = await submit()
    expect(r).toMatchObject({ ok: true, result: { counted: true, notCountedReason: null, light: 'red' } })
    expect(countRows()).toBe(1)
  })

  it('rejects a submit sooner than 2 s after start (no real test is that fast)', async () => {
    expect(await submit({}, { age: 1_500 })).toEqual({ ok: false, status: 400, error: 'too_fast' })
  })

  it('rejects a token older than 120 s', async () => {
    expect(await submit({}, { age: 121_000 })).toEqual({ ok: false, status: 400, error: 'token_expired' })
  })

  it('rejects a tampered token', async () => {
    const token = await createToken(SECRET, view.ip, 'LAX', T0)
    expect(await submit({}, { token: token.replace('.', '.x') })).toMatchObject({ status: 400, error: 'invalid_token' })
  })

  it('rejects a token issued to a different IP', async () => {
    const token = await createToken(SECRET, '198.51.100.9', 'LAX', T0)
    expect(await submit({}, { token })).toMatchObject({ status: 400, error: 'ip_mismatch' })
  })

  it('rejects a landing colo that neither the server nor the token saw', async () => {
    expect(await submit({ own: { colo: 'TPE', rtts: [8, 9, 10] } })).toMatchObject({ status: 400, error: 'colo_mismatch' })
  })

  it('accepts the token colo when the request colo changed in between', async () => {
    expect(await submit({}, { view: { colo: 'SJC' } })).toMatchObject({ ok: true })
  })

  it('replaying a token returns 409 and stores nothing more', async () => {
    const token = await createToken(SECRET, view.ip, 'LAX', T0)
    expect(await submit({}, { token })).toMatchObject({ ok: true })
    expect(await submit({}, { token })).toEqual({ ok: false, status: 409, error: 'replay' })
    expect(countRows()).toBe(1)
  })
})

describe('parseSubmit shape validation', () => {
  const valid = {
    token: 't',
    own: { colo: 'LAX', rtts: [1, 2, 3] },
    ref: null,
    tz: 'Asia/Taipei',
    deviceId: 'abcdefghijklmnop',
    contribute: true,
    conn: null,
    lang: 'en',
  }
  const parse = (over: object) => parseSubmit(JSON.stringify({ ...valid, ...over }))

  it('accepts a minimal valid body and drops unknown keys', () => {
    expect(parse({ extra: 'x' })).toEqual(valid)
  })

  it.each([
    ['too few rtts', { own: { colo: 'LAX', rtts: [1, 2] } }],
    ['too many rtts', { own: { colo: 'LAX', rtts: Array(11).fill(5) } }],
    ['rtt below 1 ms', { own: { colo: 'LAX', rtts: [0.5, 2, 3] } }],
    ['rtt above 5000 ms', { own: { colo: 'LAX', rtts: [1, 2, 5001] } }],
    ['lowercase colo', { own: { colo: 'lax', rtts: [1, 2, 3] } }],
    ['short device id', { deviceId: 'short' }],
    ['device id with odd chars', { deviceId: 'abcdefghijklmnop<script>' }],
    ['long tz', { tz: 'A'.repeat(65) }],
    ['bad lang', { lang: 'fr' }],
    ['non-boolean contribute', { contribute: 'yes' }],
    ['malformed ref', { ref: { colo: 'TPE' } }],
  ])('rejects %s', (_name, over) => {
    expect(parse(over)).toBeNull()
  })

  it('rejects non-JSON', () => {
    expect(parseSubmit('{')).toBeNull()
  })
})

// Each person should count once a day, but a whole mobile network behind one CGNAT IP must still be heard.
describe('dedup', () => {
  it('a repeat test from the same device the same day is shown but not counted again', async () => {
    expect(await submit()).toMatchObject({ result: { counted: true } })
    expect(await submit()).toMatchObject({ result: { counted: false, notCountedReason: 'duplicate' } })
    expect(countRows()).toBe(2)
  })

  it(`the ${MAX_COUNTED_PER_IP_PER_DAY + 1}st device behind one IP is a duplicate`, async () => {
    for (let i = 0; i < MAX_COUNTED_PER_IP_PER_DAY; i++) {
      expect(await submit({ deviceId: `device-${String(i).padStart(12, '0')}` })).toMatchObject({ result: { counted: true } })
    }
    expect(await submit({ deviceId: 'device-last-one-x' })).toMatchObject({
      result: { counted: false, notCountedReason: 'duplicate' },
    })
  })

  it('IPv6: addresses rotated inside one /64 share the token binding and the daily cap', async () => {
    const v6 = (host: number) => ({ ip: `2001:db8:1:2::${host.toString(16)}` })
    const token = await createToken(SECRET, ipKey('2001:db8:1:2::1'), 'LAX', T0)
    expect(await submit({ deviceId: 'device-v6-rotated-0' }, { view: v6(2), token })).toMatchObject({ ok: true })
    for (let i = 1; i < MAX_COUNTED_PER_IP_PER_DAY; i++) {
      await submit({ deviceId: `device-v6-${String(i).padStart(10, '0')}` }, { view: v6(100 + i) })
    }
    expect(await submit({ deviceId: 'device-v6-over-cap-x' }, { view: v6(999) })).toMatchObject({
      result: { counted: false, notCountedReason: 'duplicate' },
    })
    // Another /64 is another household.
    expect(await submit({ deviceId: 'device-v6-other-net' }, { view: { ip: '2001:db8:1:3::1' } })).toMatchObject({
      result: { counted: true },
    })
  })

  it('IPv6: a token from another /64 is rejected', async () => {
    const token = await createToken(SECRET, ipKey('2001:db8:1:3::1'), 'LAX', T0)
    expect(await submit({}, { view: { ip: '2001:db8:1:2::1' }, token })).toMatchObject({ error: 'ip_mismatch' })
  })

  it('a different IP with a new device is counted independently', async () => {
    await submit()
    expect(await submit({ deviceId: 'device-bbbbbbbbbbbb' }, { view: { ip: '203.0.113.8' } })).toMatchObject({
      result: { counted: true },
    })
  })

  it('non-counted rows (e.g. flagged) do not use up the device quota', async () => {
    expect(await submit({ own: { colo: 'LAX', rtts: [20, 20, 20] } }, { view: { rtt: null } })).toMatchObject({
      result: { counted: false, notCountedReason: 'suspicious' },
    })
    expect(await submit()).toMatchObject({ result: { counted: true } })
  })
})

// The international baseline is the control group in the report; it must not be stuffable either.
describe('international baseline dedup', () => {
  const tokyo = { country: 'JP', regionCode: '13', asn: 2516, lat: 35.68, lon: 139.69, colo: 'NRT' }
  const fromTokyo = (deviceId: string, ip = view.ip) =>
    submit(
      {
        deviceId,
        tz: 'Asia/Tokyo',
        own: { colo: 'NRT', rtts: [5, 6, 7] },
        ref: { colo: 'NRT', ip, ts: T0 / 1000, loc: 'JP', warp: 'off', gateway: 'off', rtts: [5, 6, 7] },
      },
      { view: { ...tokyo, ip, rtt: 6 } },
    )
  const baselineRows = () =>
    db.sqlite.prepare('SELECT baseline, counted FROM tests ORDER BY created_at, rowid').all() as {
      baseline: number
      counted: number
    }[]

  it('first test from a device enters the baseline, a repeat does not, neither is counted for Taiwan', async () => {
    await fromTokyo('device-tokyo-000001')
    await fromTokyo('device-tokyo-000001')
    expect(baselineRows()).toEqual([
      { baseline: 1, counted: 0 },
      { baseline: 0, counted: 0 },
    ])
  })

  it(`caps the baseline at ${MAX_COUNTED_PER_IP_PER_DAY} devices per IP per day`, async () => {
    for (let i = 0; i <= MAX_COUNTED_PER_IP_PER_DAY; i++) await fromTokyo(`device-tokyo-${String(i).padStart(6, '0')}`)
    const rows = baselineRows()
    expect(rows.filter((r) => r.baseline === 1)).toHaveLength(MAX_COUNTED_PER_IP_PER_DAY)
    expect(rows[MAX_COUNTED_PER_IP_PER_DAY].baseline).toBe(0)
  })

  it('unknown country (Cloudflare "XX") never enters the baseline', async () => {
    await submit(
      { deviceId: 'device-unknown-cc-1', tz: 'Asia/Tokyo', ref: null, own: { colo: 'NRT', rtts: [5, 6, 7] } },
      { view: { ...tokyo, country: 'XX', rtt: 6 } },
    )
    expect(baselineRows()).toEqual([{ baseline: 0, counted: 0 }])
  })

  it('pools are separate: being counted in Taiwan does not block the baseline and vice versa', async () => {
    await submit()
    await fromTokyo('device-aaaaaaaaaaaa')
    expect(baselineRows()).toEqual([
      { baseline: 0, counted: 1 },
      { baseline: 1, counted: 0 },
    ])
  })
})

// The UI shows /api/start's visitor immediately and the result later; they must never disagree.
describe('start visitor == result visitor', () => {
  const cfs = {
    'HiNet, province-level regionCode': { country: 'TW', city: 'Taipei', region: 'Taiwan', regionCode: '04', latitude: '25.05306', longitude: '121.52639', asn: 3462, asOrganization: 'Chunghwa Telecom' },
    'TW, county unknown': { country: 'TW', region: 'Taiwan', regionCode: '04', latitude: '23.5', longitude: '121.0', asn: 9999, asOrganization: 'Unmapped' },
    abroad: { country: 'JP', city: 'Tokyo', region: 'Tokyo', regionCode: '13', latitude: '35.6895', longitude: '139.6917', asn: 2516, asOrganization: 'KDDI' },
    'no geo, no asn': { country: 'TW' },
  }
  for (const [name, raw] of Object.entries(cfs)) {
    it(name, async () => {
      const cf = { colo: 'LAX', clientTcpRtt: 140, ...raw } as unknown as IncomingRequestCfProperties
      const v = serverViewFromCf(view.ip, cf)
      const start = visitorOf(v)
      const r = await submit({ tz: raw.country === 'TW' ? 'Asia/Taipei' : 'Asia/Tokyo' }, { view: v })
      if (!r.ok) throw new Error(r.error)
      expect({ user: r.result.user, isp: r.result.isp }).toEqual(start)
      const stored = await findResult(db.d1, r.result.id!)
      expect({ user: stored!.user, isp: stored!.isp }).toEqual(start)
    })
  }

  it('coarsening applies to start too', () => {
    const v = serverViewFromCf(view.ip, cfs['HiNet, province-level regionCode'] as unknown as IncomingRequestCfProperties)
    expect(visitorOf(v).user).toEqual({ country: 'TW', regionCode: 'TPE', region: 'Taiwan', ...COUNTY_SEATS.TPE })
  })
})

describe('opt-out', () => {
  it('returns a full result but stores no test row', async () => {
    const r = await submit({ contribute: false })
    expect(r).toMatchObject({ ok: true, result: { id: null, counted: false, notCountedReason: 'opt-out', light: 'red' } })
    expect(countRows()).toBe(0)
  })
})

describe('stored result', () => {
  it('reads back the same TestResult the submit returned, without hashes or flags', async () => {
    const r = await submit()
    if (!r.ok) throw new Error('submit failed')
    const stored = await findResult(db.d1, r.result.id!)
    expect(stored).toEqual(r.result)
    expect(JSON.stringify(stored)).not.toMatch(/hash|flags|device/)
  })

  it('stores and returns county-seat coordinates, never the geo-IP point', async () => {
    const r = await submit()
    if (!r.ok) throw new Error('submit failed')
    expect(r.result.user).toMatchObject({ regionCode: 'TPE', ...COUNTY_SEATS.TPE })
    const raw = db.sqlite.prepare('SELECT lat, lon FROM tests').get()
    expect(raw).toEqual(COUNTY_SEATS.TPE)
  })

  it('non-tw categories are stored with their category as the reason', async () => {
    const r = await submit({ tz: 'Asia/Tokyo' }, { view: { country: 'JP', asn: 2516, lat: 35.68, lon: 139.69 } })
    expect(r).toMatchObject({ result: { category: 'intl', light: 'blue', counted: false, notCountedReason: 'intl' } })
    expect(countRows()).toBe(1)
  })

  it('rejects malformed ids without querying', async () => {
    expect(await findResult(db.d1, "x' OR 1=1 --")).toBeNull()
  })
})
