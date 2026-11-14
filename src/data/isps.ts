// Taiwan ISP brands and their ASNs, grouped by the brand a normal user recognises.
// Holder names verified against RIPEstat / PeeringDB on 2026-11-14; shares from APNIC Labs eyeball estimates.
// Always key by ASN: asOrganization strings differ between registries (AS3462 and AS4782 share a name).

export interface Isp {
  key: string
  zh: string
  en: string
  asns: number[]
}

export const TW_ISPS: Isp[] = [
  // AS3462 HiNet fixed, AS17421 mobile (Mobile Business Group)
  { key: 'cht', zh: '中華電信', en: 'Chunghwa Telecom (HiNet)', asns: [3462, 17421] },
  // AS24157 is the former Taiwan Star (merged 2023-12-01)
  { key: 'twm', zh: '台灣大哥大', en: 'Taiwan Mobile', asns: [24158, 24157] },
  { key: 'twmbb', zh: '台灣大寬頻', en: 'Taiwan Mobile Broadband (TFN Media)', asns: [24163, 24164, 24165] },
  { key: 'fet', zh: '遠傳電信', en: 'Far EasTone', asns: [9674, 18412] },
  // Merged into Far EasTone 2023-12-15; kept separate because the legacy network is still distinct
  { key: 'apt', zh: '亞太電信（已併入遠傳）', en: 'Asia Pacific Telecom (now Far EasTone)', asns: [17709, 24154, 24155] },
  { key: 'seednet', zh: 'Seednet 數位聯合', en: 'Seednet (Digital United)', asns: [4780] },
  { key: 'kbro', zh: '凱擘大寬頻', en: 'kbro', asns: [38841] },
  { key: 'homeplus', zh: '中嘉寬頻', en: 'Homeplus (KBT)', asns: [9416, 18042] },
  { key: 'tbc', zh: '台灣寬頻通訊', en: 'Taiwan Broadband Communications (TBC)', asns: [131596] },
  { key: 'top', zh: '台灣數位光訊', en: 'Taiwan Optical Platform (TOP)', asns: [18049] },
  { key: 'dada', zh: '大大寬頻', en: 'DaDa Broadband', asns: [18419] },
  { key: 'sonet', zh: 'So-net', en: 'So-net Taiwan', asns: [18182] },
  { key: 'apol', zh: '亞太線上', en: 'Asia Pacific On-line (APOL)', asns: [7482] },
  { key: 'nkb', zh: '新高雄寬頻', en: 'New Kaohsiung Broadband', asns: [9922] },
  // Smaller regional cable / fibre operators: Chinese trade names unverified, so English is shown in both languages
  { key: 'peicity', zh: 'Peicity Digital Cable', en: 'Peicity Digital Cable', asns: [131627] },
  { key: 'hya', zh: 'Hsin Yeong An Cable TV', en: 'Hsin Yeong An Cable TV', asns: [131602] },
  { key: 'veetime', zh: 'VeeTIME', en: 'VeeTIME', asns: [17809] },
  { key: 'extralan', zh: 'Extra-Lan', en: 'Extra-Lan Technologies', asns: [18429] },
  { key: 'dctv', zh: 'Digidom CableTV', en: 'Digidom CableTV', asns: [131607] },
  { key: 'tnet', zh: 'TNET', en: 'TNET Communication', asns: [38851, 132157] },
  { key: 'dongfong', zh: 'DongFong', en: 'DongFong Technology', asns: [18046] },
  { key: 'pittqiao', zh: 'Pittqiao', en: 'Pittqiao Network Information', asns: [131642, 18178] },
  { key: 'sanda', zh: 'San Da Cable TV', en: 'San Da Cable TV', asns: [131611] },
  { key: 'taifo', zh: 'TAIFO', en: 'Taiwan Intelligent Fiber Optic Network', asns: [131584] },
  // Academic / government networks: real Taiwanese paths, reported as their own groups
  { key: 'tanet', zh: '台灣學術網路（TANet）', en: 'Taiwan Academic Network (TANet)', asns: [1659] },
  { key: 'twaren', zh: '台灣高速研究網路（TWAREN）', en: 'TWAREN (NCHC)', asns: [7539] },
  { key: 'asnet', zh: '中央研究院', en: 'Academia Sinica (ASNet)', asns: [9264] },
  { key: 'gsn', zh: '政府網際服務網（GSN）', en: 'Government Service Network (GSN)', asns: [4782] },
]

/** Key used for Taiwanese ASNs we have not mapped to a brand. */
export const OTHER_ISP_KEY = 'other'

/**
 * Networks whose traffic is not a household connection: cloud/hosting, VPN backbones,
 * privacy relays (WARP, iCloud Private Relay), corporate secure gateways and enterprise-only
 * Taiwanese ASNs. Tests from these are classified `vpn` (gray light: 「VPN 或公司網路」).
 */
export const HOSTING_ASNS: Record<number, string> = {
  // Cloud / hosting (global)
  16509: 'Amazon AWS', 14618: 'Amazon AWS',
  15169: 'Google', 396982: 'Google Cloud', 19527: 'Google',
  8075: 'Microsoft', 8068: 'Microsoft', 8069: 'Microsoft',
  14061: 'DigitalOcean', 393406: 'DigitalOcean',
  63949: 'Akamai Connected Cloud (Linode)',
  20473: 'Vultr',
  16276: 'OVHcloud',
  24940: 'Hetzner', 213230: 'Hetzner Cloud',
  31898: 'Oracle Cloud',
  45102: 'Alibaba Cloud', 37963: 'Alibaba Cloud (CN)', 134963: 'Alibaba Cloud (Singapore)',
  132203: 'Tencent Cloud', 45090: 'Tencent',
  51167: 'Contabo', 40021: 'Contabo (US)',
  28753: 'Leaseweb DE', 60781: 'Leaseweb NL', 59253: 'Leaseweb SG', 30633: 'Leaseweb USA',
  36351: 'IBM Cloud (SoftLayer)', 12876: 'Scaleway', 62240: 'Clouvider', 49981: 'WorldStream',
  396356: 'Latitude.sh', 53667: 'FranTech (BuyVM)', 55286: 'ServerMania', 46606: 'Unified Layer',
  26496: 'GoDaddy', 32244: 'Liquid Web', 29802: 'Hivelocity', 3223: 'Voxility',
  202425: 'IP Volume', 199524: 'G-Core Labs', 197540: 'netcup', 30083: 'Velia.net',
  26347: 'DreamHost', 9370: 'Sakura Internet', 7506: 'GMO Internet', 14576: 'Hosting Solution',
  53755: 'Input Output Flood', 18978: 'Enzu', 63023: 'GTHost', 62005: 'BlueVPS', 25820: 'IT7 Networks',
  21859: 'Zenlayer',
  // VPN backbones
  9009: 'M247', 60068: 'Datacamp / CDN77', 212238: 'Datacamp (CDNEXT)',
  209103: 'Proton VPN', 39351: '31173 Services AB', 136787: 'PacketHub',
  207990: 'HostRoyale', 218908: 'SSS-VPN Technical',
  // Foreign hosters geolocated to TW
  38136: 'Akari Networks', 56850: 'Akari Networks', 55720: 'Gigabit Hosting', 401443: 'WAP.AC',
  209854: 'Cyberzone', 61112: 'AkileCloud', 54994: 'Meteverse Cloud', 211759: 'Miku Network',
  41378: 'Kirino', 1405: 'Caelus Technology', 147049: 'PacketHub', 5065: 'Bunny Communications',
  // Privacy relays (Cloudflare WARP, iCloud Private Relay egress)
  13335: 'Cloudflare (WARP / Private Relay)', 36183: 'Akamai (Private Relay)', 20940: 'Akamai',
  54113: 'Fastly (Private Relay)',
  // Corporate secure web gateways / SASE
  53813: 'Zscaler', 55256: 'Netskope', 62654: 'Menlo Security', 44444: 'Forcepoint Cloud', 13150: 'Cato Networks',
  // Taiwan hosting / IDC / cloud
  17408: 'AboveNet Taiwan', 17651: 'AboveNet Taiwan',
  131600: 'Chief Telecom', 131606: 'Chief Telecom Cloud',
  7532: 'Gamania CloudForce', 45761: 'Gamania CloudForce', 7483: 'Skycloud Computing',
  9678: 'HostingInside', 141742: 'Magna Hosting', 134094: 'Serverfield', 131151: 'IMCLOUD',
  55789: 'TWIDC', 17420: 'Acer e-Enabling Data Center', 131586: 'NCIC IDC',
  131632: 'GMI Cloud', 131676: 'GMI Cloud', 24168: 'Cloudmax', 152626: 'Cloudbase',
  131637: 'FastCloud', 131628: 'Tai-Fu Cloud', 9917: 'Simplecloud', 7536: 'CDNEXIS',
  // Taiwanese enterprise-only / backbone networks (corporate traffic, not households)
  9924: 'Taiwan Fixed Network (enterprise)', 9919: 'New Century InfoComm', 9505: 'Taiwan Internet Gateway',
  10126: 'CHTI', 9680: 'HiNet USA', 131660: 'Chunghwa CDN', 7656: 'TWNAP', 4781: 'PAGIC.net', 4783: 'SYSTEX',
  23675: 'TSMC', 131589: 'Foxconn', 131144: 'ASUS', 131593: 'Pegatron', 131680: 'Compal', 131681: 'Qisda',
  131599: 'Wistron', 131663: 'Gigabyte', 131683: 'InnoLux', 131655: 'Nan Ya Plastics', 18422: 'ITRI', 18426: 'NARL',
  131623: 'Shopee TW', 10229: 'Yahoo TW', 133089: 'Qualcomm TW', 140079: 'Garmin',
  18045: 'SinoPac', 131143: 'Chinatrust', 131148: 'Bank of Taiwan', 131587: 'Mega Bank', 18421: 'Taishin Bank',
  131588: 'FISC', 150772: 'NCCC',
}

const byAsn = new Map<number, Isp>()
for (const isp of TW_ISPS) for (const asn of isp.asns) byAsn.set(asn, isp)

export function ispForAsn(asn: number | null | undefined): Isp | undefined {
  return asn == null ? undefined : byAsn.get(asn)
}

export function getIsp(key: string): Isp | undefined {
  return TW_ISPS.find((i) => i.key === key)
}

export function isHostingAsn(asn: number | null | undefined): boolean {
  return asn != null && asn in HOSTING_ASNS
}
