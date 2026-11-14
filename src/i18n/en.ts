import type { Dict } from './zh'

// English copy: more data-driven than zh (ASN, colo codes, peering are fine); Chinese jokes are rewritten, not translated.
const n = (v: number) => v.toLocaleString('en-US')

// Sublines shared by the visitor's own result and someone else's (a shared link), which differ
// only in whose connection it is. Either number can be missing (no county, no baseline).
const yellowSub = (km: number | null, ms: number | null) =>
  km == null && ms == null
    ? 'A little farther than Taipei.'
    : 'About ' + [km != null && `${n(km)} km`, ms != null && `${n(ms)} ms`].filter(Boolean).join(' and ') + ' extra per round trip.'
const redSub = (whose: string) => (km: number | null, ms: number | null) =>
  whose + (km != null ? ` traveled ${n(km)} km` : ' went abroad') + (ms != null ? ` — ${n(ms)} ms more per round trip.` : '.')
const greenSub = (ms: number | null) => (ms != null ? `Handled nearby in Taiwan — about ${n(ms)} ms per round trip.` : 'Handled nearby in Taiwan.')
const blueSub = (joins: string) => (pct: number | null) =>
  'Landing nearby is normal.' +
  (pct != null ? ` In Taiwan, ${pct}% of Chunghwa Telecom tests land in the US.` : '') +
  ` ${joins} the international baseline, not the Taiwan statistics.`

// The privacy note, shown in full on the methodology page (/methodology#privacy).
const privacy =
  'We do not store your IP address. To stop repeat submissions, a keyed hash of your IP and device id that includes the date is kept for 48 hours, then removed from the database; database backups may keep it for up to 30 more days. Server request logging is off, so no logs hold your IP. Each test stores only ISP/ASN, county-level location, landing data centers, round-trip times, device time zone and connection type, for anonymous statistics. Only daily aggregates are published for download, never individual tests; landing data centers with fewer than 3 tests for an ISP on a day are merged. You can switch off "Share data" at any time; when it is off, nothing is stored. Fonts are served by Google Fonts, so your browser connects to Google to load them. To keep automated submissions out of the statistics we use Cloudflare Turnstile, which loads from challenges.cloudflare.com.'

export const en: Dict = {
  htmlLang: 'en',
  ogLocale: 'en_US',
  name: 'Is your connection leaving Taiwan?',
  brand: 'Detour',
  nav: {
    how: 'How we measure',
    stats: 'Taiwan stats',
    home: 'Home',
    menu: 'Main menu',
    switchTo: '切換到繁體中文',
    switchShort: '中文',
    skip: 'Skip to main content',
  },
  langBanner: {
    text: '本站也有繁體中文版。',
    go: '切換到中文',
    dismiss: 'Dismiss',
  },
  meta: {
    homeTitle: 'Detour — Is your connection leaving Taiwan?',
    homeDesc:
      'A 3-second browser test that shows which Cloudflare data center your connection lands in, how far it detoured from Taipei and how much latency that adds. Anonymous results become open data.',
    statsTitle: 'Taiwan connection statistics | Detour',
    statsDesc:
      'Landing data centers, median latency and detour by Taiwanese ISP for Cloudflare free-plan sites, with a county breakdown, 30-day trend and international baseline. CSV download, CC BY 4.0.',
    methodTitle: 'Methodology: how Detour measures Cloudflare routing | Detour',
    methodDesc:
      'Measurement procedure, the cloudflare.com baseline, anti-abuse checks, privacy, data licence, limitations, and a full table of Cloudflare colo codes.',
    resultTitle: (city: string) => `My connection landed in ${city} | Detour`,
    resultDesc: (city: string, isp: string) =>
      `A ${isp} connection landed in ${city}. Where does yours land?`,
    notFoundTitle: 'Result not found | Detour',
    pageNotFoundTitle: 'Page not found | Detour',
    appName: 'Detour',
    datasetName: "Where Taiwan's traffic lands: Cloudflare landing data centers by ISP",
    datasetDesc:
      "Anonymous browser measurements from users in Taiwan on Taiwanese networks, aggregated by day: for each day, ISP and landing Cloudflare data center, the number of tests, their share of that ISP's tests that day, and median measured round-trip time, Taiwan-node round-trip time (cloudflare.com, measured in the same test) and added latency. Only tests passing anti-abuse and physics checks are counted; data centers with fewer than 3 tests that day are grouped as OTHER.",
  },
  measure: {
    steps: ['Tracing your connection…', 'Looks like it is boarding a plane…', 'Landed!'],
    hint: 'Timing 5 round trips. About 3 seconds.',
    failed: "The test didn't finish — the network may be unstable. Try again?",
    rate: 'Too many tests in a short time. Please wait a minute and try again.',
    offline: 'You seem to be offline. Reconnect and try again?',
    retry: 'Try again',
    retest: 'Run the test again',
    again: 'Test again',
    noscript: 'This test runs in your browser and needs JavaScript.',
  },
  status: {
    green: 'No detour',
    yellow: 'Small detour',
    red: 'Left Taiwan',
    gray: 'May not be accurate',
    blue: 'Abroad',
    pending: 'Testing',
    error: 'Test incomplete',
  },
  card: {
    title: {
      green: (city: string) => `Your connection landed in ${city}.`,
      yellow: (city: string) => `A small detour — your connection went to ${city}.`,
      red: (city: string) => `Your connection left the country: ${city}.`,
      gray: () => 'This result may not reflect your home connection.',
      blue: (city: string, country: string) => `You're testing from ${country}. Landing in ${city}.`,
    },
    sub: {
      green: greenSub,
      yellow: yellowSub,
      red: redSub('Your connection'),
      gray: 'You seem to be on a VPN or corporate network. Try again without a VPN.',
      blue: blueSub('Your result joins'),
    },
    shared: {
      title: {
        green: (city: string) => `This connection landed in ${city}.`,
        yellow: (city: string) => `A small detour — this connection went to ${city}.`,
        red: (city: string) => `This connection left the country: ${city}.`,
        gray: () => 'This result may not reflect a typical home connection.',
        blue: (city: string, country: string) => `Tested from ${country}. Landing in ${city}.`,
      },
      sub: {
        green: greenSub,
        yellow: yellowSub,
        red: redSub('This connection'),
        gray: 'The tester seems to be on a VPN or corporate network, so the numbers may be off.',
        blue: blueSub('This result joins'),
      },
      you: 'Tested from',
      network: 'Network',
    },
    roaming: "Your device doesn't seem to be in Taiwan, so latency will be higher. Not counted in Taiwan stats.",
    foreignSim:
      "You seem to be in Taiwan on a foreign mobile network (e.g. a travel eSIM), so this joins the international baseline.",
    suspicious: 'These numbers look unusual. Shown as usual, not counted.',
    optOut: '"Share data" is off — nothing from this test was stored.',
    you: 'You are in',
    youValue: (region: string) => `${region} (approx.)`,
    network: 'Your network',
    landing: 'Lands in',
    latency: 'Latency (RTT)',
    ms: 'ms',
    km: 'km',
    // Measured to cloudflare.com in the same test, not estimated; the code is where it landed.
    taiwanNode: (iata?: string) => (iata ? `Taiwan node ${iata}` : 'Taiwan node'),
    landingDc: 'Data center',
    testedAt: 'Tested',
    viaRef: (iata: string) => `Baseline (${iata})`,
    // "Nearest data center NRT" would not fit the stub's half column on a 360 px phone.
    nearest: (iata?: string) => (iata ? `Nearest node ${iata}` : 'Nearest node'),
    extraMsHero: 'Added latency',
    // The whole way to the landing data center, not the extra; sublines speak of the detour.
    distanceLabel: 'Distance',
    unknownRegion: 'Unknown',
    actions: {
      stats: 'See all of Taiwan',
      share: 'Share result',
      why: 'Why does this happen?',
      whose: 'Whose problem is this?',
      retest: 'Run the test again',
      family: 'Ask friends in Taiwan to test',
    },
    contribute: 'Share data',
  },
  map: {
    label: (from: string, to: string) => `Route map: from ${from} to ${to}`,
    labelPending: 'Route map: tracing',
    you: 'You',
    taiwan: 'Taiwan',
  },
  share: {
    heading: 'Share your result',
    close: 'Close',
    layoutLabel: 'Image layout',
    layoutStory: 'Portrait',
    layoutWide: 'Landscape',
    previewAlt: 'Preview of the result image',
    preparing: 'Rendering your result image…',
    imageFailed: 'The image could not be rendered right now. Share the link or the text instead.',
    shareImage: 'Share this image',
    download: 'Download image',
    copyLink: 'Copy link',
    linkCopied: 'Link copied',
    copyFailed: "Couldn't copy. Please select the text by hand",
    noId: '"Share data" is off, so this result was not stored. A result link and image need a stored result; the text can still be shared.',
    // Turnstile could not verify the test; neutral on purpose, nobody is being accused.
    notStored: 'This result was not stored, so no share link can be made. The text can still be shared.',
    contributeAndShare: 'Turn on "Share data" and retest to get a link and image',
    textOnly: 'Share text only',
    text: {
      out: (city: string, km: number | null, url: string) =>
        `My connection left Taiwan and landed in ${city}` +
        (km != null ? ` — a ${n(km)} km detour` : '') +
        `. Where does yours land? ${url}`,
      home: (city: string, url: string) => `My connection stayed in Taiwan and landed in ${city}. What about yours? ${url}`,
      generic: (url: string) => `Is your connection leaving Taiwan? Test it in 3 seconds: ${url}`,
    },
    textShared: {
      out: (city: string, km: number | null, url: string) =>
        `This connection left Taiwan and landed in ${city}` +
        (km != null ? ` — a ${n(km)} km detour` : '') +
        `. Where does yours land? ${url}`,
      home: (city: string, url: string) => `This connection stayed in Taiwan and landed in ${city}. What about yours? ${url}`,
    },
    shareTitle: 'Detour — Is your connection leaving Taiwan?',
  },
  stats: {
    heading: 'Live from Taiwan',
    domestic: 'Taiwan',
    yellow: 'Nearby',
    red: 'Far away',
    trend: 'Share landing in Taiwan, last 30 days',
    more: 'Read the full report',
    empty: 'Collecting data',
    unavailable: 'Statistics are unavailable right now. Please check back later.',
    lowSample: 'Small sample',
  },
  why: {
    heading: 'Why does this happen?',
    you: 'You',
    trip: {
      title: 'The web is a string of round trips',
      body: [
        "Each time you open a page, your browser sends requests and waits for the replies. A typical page makes dozens of them, and many can't start until an earlier one has come back. Once it has loaded, every click, scroll and keystroke is another exchange with a server. So how long one round trip takes decides how fast the web feels.",
      ],
      site: 'Website',
      ask: 'Request',
      answer: 'Response',
      alt: 'Diagram: a phone sends a request and the website sends the content back',
    },
    web: {
      title: 'The reply usually comes from Cloudflare, not the website',
      body: [
        'Close to 30% of all websites are served through Cloudflare, which provides security, caching and edge computing. When you visit one of them, you are really connecting to a Cloudflare data center: the nearest one answers directly, or fetches the content from the site for you.',
      ],
      but: 'Cloudflare has data centers in Taipei and Kaohsiung, so your requests should be answered inside Taiwan. But…',
      near: 'Cloudflare',
      origin: 'Origin website',
      alt: 'Diagram: Cloudflare answers most of your requests itself and passes only a few on to the origin website',
    },
    peer: {
      title: 'Which data center you reach depends on where your ISP connects to Cloudflare',
      body: [
        "All of Cloudflare's data centers share the same IP addresses. Which one your request ends up at depends on how your internet provider (ISP) routes it, and an ISP can only hand traffic over where it has a direct connection with Cloudflare.",
        "If your ISP and Cloudflare don't interconnect in Taiwan, or don't let ordinary traffic use that link, the request leaves the country first, is handed to Cloudflare in the US or elsewhere, and the reply travels all the way back to Taiwan.",
      ],
      direct: 'Normal route',
      detour: 'Detour route',
      isp: 'ISP',
      taipei: 'Taipei',
      pacific: 'Pacific',
      joined: 'Interconnect in Taiwan',
      notJoined: 'No interconnect in Taiwan',
      // Sits above the far end of the detour; a longer city name would run into the route's arc.
      joinedFar: (city: string) => (city.length > 11 ? 'Interconnect abroad' : `Interconnect in ${city}`),
      alt: {
        direct: 'Diagram: the request is handed to Cloudflare in Taiwan and answered from Taipei',
        detour: (city: string) => `Diagram: the request crosses the Pacific and reaches Cloudflare in ${city}`,
        detourNear: (city: string) => `Diagram: the request leaves Taiwan and reaches Cloudflare in ${city}`,
      },
      ms: (v: string) => `about ${v} ms`,
      measured: 'Measured',
      example: 'example figure',
    },
    cost: {
      title: 'The detour costs something on every single trip',
      items: [
        {
          icon: 'slow',
          h: 'Every round trip gets slower',
          p: 'Taipei to Los Angeles is about 10,000 km. Even at the speed of light in fiber, a round trip takes at least 0.1 seconds; landing in Taiwan usually takes a few milliseconds. A page needs dozens of round trips, and that adds up to the "why is this so slow" you feel.',
        },
        {
          icon: 'twice',
          h: 'A site in Taiwan, across the Pacific twice',
          p: "Many Taiwanese sites keep their servers in Taiwan or elsewhere in Asia. Requests that need the site itself, like logging in, checking out or searching, have to be passed on by Cloudflare. So your request flies to the US, then back to Taiwan to reach the server, and the reply retraces the whole route: something that could stay on the island crosses the Pacific twice.",
        },
        {
          icon: 'faster',
          h: 'Americans get Taiwanese sites faster than you',
          p: 'Cloudflare keeps copies of site content in data centers around the world. A visitor in the US gets a Taiwanese site from a data center nearby; you, in Taiwan, have to fetch it from the US too. The same Taiwanese site is slower for people in Taiwan.',
        },
        {
          icon: 'cable',
          h: 'Everyone squeezes onto the same undersea cables',
          p: 'Traffic sent abroad has to share limited international submarine cable capacity. The evening peak congests it most; congestion drops packets, every dropped packet is sent again, and every resend crosses the Pacific once more. Downloading large files or watching video, you feel it as stalls and lower quality.',
        },
        {
          icon: 'unfair',
          h: 'Small companies lose out to big ones',
          p: "Cloudflare's routing priority is reserved for its top enterprise tier, at least US$3,000 a month depending on traffic. Large companies that can pay are served via Taipei; startups, small shops and personal sites that can't are sent the long way. In the same market, speed is unequal from the start.",
        },
        {
          icon: 'shield',
          h: 'Giving up protection for speed',
          p: "Cloudflare doesn't only speed sites up. It blocks DDoS attacks, filters malicious traffic and bots, and hides a site's real server address. The detour forces sites to choose whether to give that protection up and face the internet directly so their users connect faster. The speed comes back, and the protection goes with it.",
        },
      ] as { icon: 'slow' | 'twice' | 'faster' | 'cable' | 'unfair' | 'shield'; h: string; p: string }[],
    },
  },
  act: {
    heading: 'What you can do',
    ask: "Our ask: Chunghwa Telecom and Cloudflare should interconnect directly in Taiwan, or route traffic to nearby Asian data centers, so people in Taiwan don't have to put up with high-latency connections.",
    ispTitle: 'Tell your ISP (template in Chinese)',
    chtLink: 'Chunghwa Telecom',
    chtLinkName: 'Chunghwa Telecom feedback form',
    govTitle: 'Write to the regulators (template in Chinese)',
    nccLink: 'NCC',
    nccLinkName: 'NCC "Write to us"',
    modaLink: 'Ministry of Digital Affairs',
    modaLinkName: 'Ministry of Digital Affairs (moda) public mailbox',
    cfTitle: 'Tell Cloudflare',
    cfLink: 'Cloudflare',
    // Starts with the visible label, so voice control can still say "Cloudflare".
    cfLinkName: 'Cloudflare support and contact',
    newTab: (name: string) => `${name} (opens in a new tab)`,
  },
  footer: {
    method: 'Methodology',
    stats: 'Statistics report',
    license: 'Data licensed CC BY 4.0',
    source: 'Source code',  },
  report: {
    eyebrow: 'Report',
    title: 'Taiwan connection statistics',
    lead: (days: number) =>
      `Anonymous browser tests from users in Taiwan on Taiwanese networks, last ${days} days.`,
    updated: (t: string) => `Updated ${t}`,
    ispHeading: 'Connections',
    ispCols: {
      isp: 'ISP',
      n: 'n',
      domestic: 'Taiwan node',
      lights: 'Landing mix',
      rtt: 'Median RTT',
      // Not just "Taiwan node": that is the share column's header.
      ref: 'Taiwan node RTT',
      extra: 'Median added latency',
      top: 'Most common node',
    },
    coloHeading: 'Connections by ISP',
    daily: {
      caption: (days: number) => `Daily mix, last ${days} days`,
      label: (isp: string, days: number) => `${isp}: daily landing mix, last ${days} days`,
      day: (date: string, n: string, shares: string) => `${date}: ${n} ${n === '1' ? 'test' : 'tests'}; ${shares}`,
      none: (date: string) => `${date}: no tests`,
      few: ' (small sample)',
    },
    trendHeading: 'Share landing in Taiwan, last 30 days',
    intlHeading: 'International connections',
    intlCols: { country: 'Country / region', n: 'n', dist: 'Median landing distance', top: 'Most common node' },
    empty: 'Not enough data for a report yet.',
    unavailable: 'Statistics are unavailable right now. Please try again later.',
    other: 'Other',
  },
  method: {
    eyebrow: 'Methodology',
    title: 'How we measure',
    lead: 'Every measurement runs in your browser. The method and the data are public.',
    sections: [
      {
        id: 'targets',
        h: 'Two targets',
        p: [
          'This site (detour.tw) is deployed on a Cloudflare Free-plan zone. Its /cdn-cgi/trace endpoint reports the colo (data center code) that served you — the landing data center an ordinary Cloudflare site gets for your connection.',
          'We also time cloudflare.com/cdn-cgi/trace. cloudflare.com is Cloudflare\'s own Enterprise zone, which normally lands in a Taiwan data center for users in Taiwan. It is our "ideal path" baseline — the "Taiwan node" figure on the result card, measured live in every test, not estimated.',
        ],
      },
      {
        id: 'procedure',
        h: 'Procedure',
        p: [
          'The browser first gets a single-use signed token, then makes 1 warm-up request and 5 timed requests to each target, interleaved (ours, baseline, ours, baseline…) so transient congestion affects both equally.',
          'Requests bypass caches with a random query string; timing covers request start to body read. Each request times out after 4 s, the whole test after 15 s. We report the median of the 5 samples.',
        ],
      },
      {
        id: 'checks',
        h: 'Anti-abuse and sanity checks',
        p: [
          'Tokens are HMAC-signed, single-use, valid only between 2 and 120 s after issue, and bound to the requesting address.',
          'Physics check: light in fibre covers about 200 km per ms, so an RTT below the distance-based lower bound is impossible. The server also compares client timings with the TCP RTT it observes. Implausible tests are shown but not counted.',
          'One counted test per device per day. The device id lives in the browser, and clearing it makes a new device, so this is best effort.',
          'At most 20 counted tests per IP per day; for IPv6 a /64 counts as one address (a household is usually given a whole /64), and so do the rate limits. Mobile carriers put many users behind one IP (CGNAT), so mobile networks may be under-sampled.',
        ],
      },
      {
        id: 'excluded',
        h: 'What is excluded, and why',
        p: [
          'Only tests from users in Taiwan on Taiwanese networks count toward Taiwan statistics. Tests from abroad and travel eSIMs form the international baseline; roaming, VPN, corporate and hosting networks are shown but not counted.',
          'Tests with "Share data" switched off are not stored at all.',
        ],
      },
      {
        id: 'limits',
        h: 'Limitations',
        p: [
          'County location comes from IP geolocation and can be wrong. Mobile networks are the worst case: carrier address blocks are often registered in Taipei, so county statistics skew toward Taipei City. ISPs are identified by ASN; small providers may be grouped as "other".',
          'cloudflare.com is not a perfect proxy: as an Enterprise zone it may route differently from other Enterprise sites. The "Taiwan node" figure is measured on cloudflare.com: it shows how fast a site served in Taiwan is, not that every such site is exactly as fast.',
          'Browser timings include TLS, HTTP and browser overhead, so they read slightly higher than ping. Both targets are timed the same way, so they are comparable.',
          'Round-trip times are measured and reported by your browser. The server can only check that they are plausible, not verify each one, so the median RTT and the median added latency are computed from client-reported values.',
          'Volunteers are not a random sample; participants may skew toward people who care about this issue.',
        ],
      },
    ],
    ispHeading: 'How ISPs are grouped',
    ispLead:
      'Tests are attributed by ASN and grouped under the brand a customer would recognise. Registry organisation names differ between databases, so names are never used as the key.',
    ispNotes: [
      'Chunghwa Telecom covers HiNet fixed broadband (AS3462) and its mobile network (AS17421).',
      'Taiwan Star merged into Taiwan Mobile in December 2023; its former AS24157 is counted under Taiwan Mobile.',
      'Asia Pacific Telecom merged into Far EasTone in December 2023; the legacy network is still distinguishable and is listed separately.',
      "Taiwan Mobile's mobile network (AS24158) and Taiwan Mobile Broadband (AS24163–24165) are reported separately.",
      'Academic and government networks are their own groups. Cloud, VPN, iCloud Private Relay and WARP addresses are not household connections: they get the gray light and are never counted.',
      'Taiwanese ASNs not mapped to a brand are reported as "Other Taiwanese networks".',
    ],
    ispCols: { isp: 'Brand', asns: 'ASNs' },
    privacyHeading: 'Privacy',
    privacy,
    licenseHeading: 'Data licence',
    download: 'Download daily statistics (CSV)',
    // The address follows as a link.
    contactLead: 'Questions about the data or the method? Write to',
    licenseBody: 'Statistics are licensed CC BY 4.0. Reuse freely; please credit "Detour (detour.tw)".',
    dataBody:
      "The download holds daily statistics, not individual tests. Each row is one day (Taipei time), one ISP and one landing data center: the number of counted tests, their share of that ISP's tests that day, and the medians of the measured round-trip time, the Taiwan-node round-trip time and the added latency. Data centers with fewer than 3 tests for an ISP on a day are merged into one OTHER row, which shows no medians while it has fewer than 3 tests itself, so no single person's test can be picked out.",
    datedBody:
      '/api/export.csv covers every day and is refreshed every hour. Once a day is over, a file with only that day is added and never changes (/api/export/YYYY-MM-DD.csv, e.g. /api/export/2026-11-13.csv). Cite that file to point at a fixed version.',
    openSource: 'Method and code are open',
    coloHeading: 'Cloudflare colo codes',
    coloLead: (count: number) =>
      `Cloudflare names data centers after the nearest airport (IATA code). This table maps all ${count} colos we know to cities; the result card uses it.`,
    coloSearch: 'Search city, country or code',
    coloCols: { iata: 'Code', city: 'City', country: 'Country / region', region: 'Region' },
    coloCount: (shown: number, total: number) => `Showing ${shown} of ${total}`,
    regions: {
      asia: 'Asia',
      oceania: 'Oceania',
      'north-america': 'North America',
      'south-america': 'Latin America',
      europe: 'Europe',
      'middle-east': 'Middle East',
      africa: 'Africa',
    },
  },
  result: {
    cta: 'Test my connection',
    notFound: 'Result not found',
    errorTitle: "This result can't be loaded right now",
    errorBody: 'The server may be busy. Reload in a moment, or run your own test.',
    notFoundBody: "The link may be mistyped, or this result doesn't exist. You can run your own test.",
  },
  notFound: { title: 'Page not found', body: 'The address may be mistyped. Head home and test your connection.' },
  unknownColo: 'unknown location',
  listSep: ', ',
  sentenceSep: '. ',
  exportNotReady: 'The data export is being prepared. Please try again later.',
  breadcrumbHome: 'Home',
}
