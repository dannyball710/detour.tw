import { haversineKm } from '#/lib/geo'
import { TW_REGIONS } from '#/data/tw-regions'

// Seat of each county / city government. Also the only coordinates we publish for a Taiwanese test.
export const COUNTY_SEATS: Record<string, { lat: number; lon: number }> = {
  TPE: { lat: 25.0375, lon: 121.5637 },
  NWT: { lat: 25.012, lon: 121.465 },
  KEE: { lat: 25.1318, lon: 121.7445 },
  TAO: { lat: 24.9936, lon: 121.301 },
  HSZ: { lat: 24.8039, lon: 120.9647 },
  HSQ: { lat: 24.827, lon: 121.0129 },
  MIA: { lat: 24.5602, lon: 120.8214 },
  TXG: { lat: 24.1618, lon: 120.6469 },
  CHA: { lat: 24.0809, lon: 120.5385 },
  NAN: { lat: 23.9097, lon: 120.6839 },
  YUN: { lat: 23.7092, lon: 120.5431 },
  CYI: { lat: 23.4801, lon: 120.4491 },
  CYQ: { lat: 23.459, lon: 120.332 },
  TNN: { lat: 22.9927, lon: 120.1849 },
  KHH: { lat: 22.6203, lon: 120.312 },
  PIF: { lat: 22.6727, lon: 120.488 },
  ILA: { lat: 24.757, lon: 121.7531 },
  HUA: { lat: 23.9872, lon: 121.6016 },
  TTT: { lat: 22.7583, lon: 121.1444 },
  PEN: { lat: 23.5655, lon: 119.5793 },
  KIN: { lat: 24.432, lon: 118.3171 },
  LIE: { lat: 26.1597, lon: 119.9512 },
}

// English place names as they appear in geo-IP data (MaxMind / Cloudflare `city`), incl. common romanisations.
// Names shared by districts in different counties (Zhongshan, Xinyi, Da'an, Datong, Luzhu, Xihu…) are left out.
const CITY_NAMES: Record<string, string[]> = {
  TPE: ['taipei', 'taipeicity', 'beitou', 'shilin', 'neihu', 'nangang', 'wanhua', 'wenshan', 'songshan'],
  NWT: [
    'newtaipei', 'newtaipeicity', 'banqiao', 'banciao', 'xinzhuang', 'sinjhuang', 'zhonghe', 'jhonghe', 'yonghe',
    'sanchong', 'luzhou', 'tamsui', 'danshui', 'xindian', 'sindian', 'tucheng', 'shulin', 'yingge', 'sanxia',
    'linkou', 'taishan', 'wugu', 'xizhi', 'sijhih', 'ruifang', 'bali',
  ],
  KEE: ['keelung', 'keelungcity', 'jilong'],
  TAO: [
    'taoyuan', 'taoyuancity', 'zhongli', 'jhongli', 'chungli', 'pingzhen', 'bade', 'yangmei', 'dayuan', 'guishan',
    'longtan', 'daxi',
  ],
  HSZ: ['hsinchu', 'hsinchucity', 'xinzhu'],
  HSQ: ['hsinchucounty', 'zhubei', 'jhubei', 'chupei', 'hukou', 'xinfeng', 'guanxi', 'zhudong', 'chutung'],
  MIA: ['miaoli', 'miaolicounty', 'toufen', 'zhunan', 'chunan', 'houlong', 'tongxiao', 'yuanli'],
  TXG: [
    'taichung', 'taichungcity', 'fengyuan', 'taiping', 'dali', 'wufeng', 'shalu', 'qingshui', 'wuqi', 'tanzi', 'daya',
    'longjing', 'houli', 'dajia',
  ],
  CHA: ['changhua', 'changhuacounty', 'yuanlin', 'lukang', 'hemei', 'beidou'],
  NAN: ['nantou', 'nantoucounty', 'caotun', 'puli', 'zhushan'],
  YUN: ['yunlin', 'yunlincounty', 'douliu', 'huwei', 'dounan', 'xiluo', 'beigang'],
  CYI: ['chiayi', 'chiayicity', 'jiayi'],
  CYQ: ['chiayicounty', 'taibao', 'puzi', 'minxiong'],
  TNN: ['tainan', 'tainancity', 'yongkang', 'xinying', 'rende', 'guiren', 'annan', 'anping', 'madou', 'xinhua'],
  KHH: [
    'kaohsiung', 'kaohsiungcity', 'fengshan', 'gangshan', 'zuoying', 'nanzi', 'nanzih', 'sanmin', 'lingya',
    'qianzhen', 'xiaogang', 'renwu', 'daliao', 'niaosong', 'qishan',
  ],
  PIF: ['pingtung', 'pingtungcounty', 'chaozhou', 'donggang', 'hengchun', 'fangliao'],
  ILA: ['yilan', 'ilan', 'yilancounty', 'luodong', 'lotung', 'toucheng', 'suao', 'jiaoxi'],
  HUA: ['hualien', 'hualiencity', 'hualiencounty', 'jian', 'yuli', 'fenglin'],
  TTT: ['taitung', 'taitungcity', 'taitungcounty', 'chenggong'],
  PEN: ['penghu', 'magong', 'makung'],
  KIN: ['kinmen', 'jincheng', 'jinhu', 'jinsha'],
  LIE: ['lienchiang', 'matsu', 'nangan'],
}

const BY_NAME = new Map<string, string>()
for (const [code, names] of Object.entries(CITY_NAMES)) for (const n of names) BY_NAME.set(n, code)

const normalise = (s: string) =>
  s
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

function countyFromCity(city: string): string | null {
  const n = normalise(city)
  return BY_NAME.get(n) ?? BY_NAME.get(n.replace(/(city|district|township)$/, '')) ?? null
}

// When geo-IP only knows "somewhere in Taiwan" it returns a country-level default point; that is not a location.
const COUNTRY_DEFAULT_POINTS = [
  { lat: 23.5, lon: 121.0 },
  { lat: 24.0, lon: 121.0 },
]
const SEAT_RADIUS_KM = 25

function countyFromPoint(lat: number, lon: number): string | null {
  if (COUNTRY_DEFAULT_POINTS.some((p) => haversineKm(lat, lon, p.lat, p.lon) < 2)) return null
  let best: string | null = null
  let bestKm = SEAT_RADIUS_KM
  for (const [code, seat] of Object.entries(COUNTY_SEATS)) {
    const km = haversineKm(lat, lon, seat.lat, seat.lon)
    if (km <= bestKm) {
      best = code
      bestKm = km
    }
  }
  return best
}

/**
 * Taiwanese county (TW_REGIONS key) for a request. Cloudflare's regionCode for Taiwan is often a legacy
 * province-level code ("04" = Taiwan), so fall back to the city name, then to the nearest county seat.
 */
export function deriveCounty(input: {
  regionCode: string | null
  city: string | null
  lat: number | null
  lon: number | null
}): string | null {
  if (input.regionCode && input.regionCode in TW_REGIONS) return input.regionCode
  const byCity = input.city ? countyFromCity(input.city) : null
  if (byCity) return byCity
  if (input.lat != null && input.lon != null) return countyFromPoint(input.lat, input.lon)
  return null
}
