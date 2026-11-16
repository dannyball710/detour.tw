// Shared contracts between the browser, the Worker API and the OG image renderer.

export type Lang = 'zh' | 'en'

/** Traffic light shown on the result card. */
export type Light = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

/**
 * tw          – in Taiwan, Taiwanese network: counted in Taiwan stats
 * intl        – IP outside Taiwan: international baseline
 * foreign-sim – IP outside Taiwan but device timezone is Asia/Taipei (traveller eSIM etc.)
 * roaming     – IP in Taiwan but device timezone is not Taiwan
 * vpn         – hosting / VPN / WARP / corporate network
 */
export type Category = 'tw' | 'intl' | 'foreign-sim' | 'roaming' | 'vpn'

export type NotCountedReason =
  | 'opt-out'
  /** The measured colo is not where the Worker ran (routing switched mid-test): shown, not stored. */
  | 'unstable-route'
  /** Not submitted by our own page (another site, or no Origin): shown, not stored. */
  | 'foreign-origin'
  | 'intl'
  | 'foreign-sim'
  | 'roaming'
  | 'vpn'
  | 'duplicate'
  | 'suspicious'

/** GET /api/start */
export interface StartResponse {
  token: string
  /** Colo that served this request — the landing colo of our free-plan hostname. */
  colo: string
  /** Server's view of the visitor, coarsened exactly like TestResult (so the UI can show it immediately). */
  user: TestResult['user']
  isp: TestResult['isp']
}

/** Parsed body of a /cdn-cgi/trace response (subset). */
export interface Trace {
  colo: string
  ip: string
  ts: number
  loc: string
  warp: string
  gateway: string
  http: string
}

/** POST /api/submit */
export interface SubmitRequest {
  token: string
  own: { colo: string; rtts: number[] }
  /** cloudflare.com/cdn-cgi/trace — null when it failed (e.g. blocked by an extension). */
  ref: (Omit<Trace, 'http'> & { rtts: number[] }) | null
  tz: string
  deviceId: string
  contribute: boolean
  conn: string | null
  lang: Lang
}

export interface TestResult {
  /** Public id for /r/:id — null when the visitor opted out (nothing stored). */
  id: string | null
  createdAt: number
  light: Light
  category: Category
  counted: boolean
  notCountedReason: NotCountedReason | null
  user: {
    country: string | null
    /** ISO 3166-2 subdivision code without country prefix, e.g. "TPE". */
    regionCode: string | null
    /** Raw region name from Cloudflare geolocation (English), fallback when regionCode is unknown. */
    region: string | null
    lat: number | null
    lon: number | null
  }
  isp: { key: string; asn: number | null; asOrganization: string | null }
  landing: { iata: string; rttMs: number; distanceKm: number | null }
  /** Reference measurement against cloudflare.com (an Enterprise zone, normally routed locally). */
  ref: { iata: string; rttMs: number; distanceKm: number | null } | null
  extraKm: number | null
  extraMs: number | null
}

export interface IspStats {
  key: string
  n: number
  /** Share of tests landing in Taiwan (TPE/KHH), 0..1 */
  domestic: number
  /** Share of tests by light, 0..1 */
  lights: { green: number; yellow: number; red: number }
  medianRtt: number | null
  medianRefRtt: number | null
  medianExtraMs: number | null
  /** Landing colos, most frequent first (top 8 + "other" folded by the client if needed). */
  colos: { iata: string; n: number }[]
}

/** GET /api/stats */
export interface StatsResponse {
  generatedAt: number
  windowDays: number
  totals: { counted: number; today: number; allTime: number }
  isps: IspStats[]
  /** Daily share of domestic landings per ISP over the window. */
  trend: {
    day: string
    isp: string
    n: number
    /** Same as lights.green; kept for compatibility. */
    domestic: number
    /** Share of that day's counted tests by light (Taiwan / nearby / far), 0..1, summing to 1. */
    lights: { green: number; yellow: number; red: number }
  }[]
  /** TW subdivisions (counted tests only). */
  regions: { code: string; n: number; abroad: number }[]
  /** International baseline: tests from outside Taiwan. */
  intl: { country: string; n: number; medianDistanceKm: number | null; topColo: string | null }[]
  /** Share of counted Chunghwa Telecom tests landing in the US, 0..1 — used in copy. */
  chtUsShare: number | null
}

export interface ApiError {
  error: string
}
