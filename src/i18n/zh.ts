// Traditional Chinese copy. Tone rules: say 「兩家」, use 繞路／落地在／多走了／互連.
const n = (v: number) => v.toLocaleString('zh-TW')

// Sublines shared by the visitor's own result and someone else's (a shared link), which differ
// only in whose connection it is. Either number can be missing (no county, no baseline).
const yellowSub = (km: number | null, ms: number | null) =>
  km == null && ms == null
    ? '連線繞到台灣附近的節點，比走台北遠一些。'
    : [km != null && `多走了約 ${n(km)} 公里`, ms != null && `每次來回多約 ${n(ms)} 毫秒`].filter(Boolean).join('，') + '。'
const redSub = (whose: string) => (km: number | null, ms: number | null) => {
  if (km == null) return ms != null ? `${whose}來回多了 ${n(ms)} 毫秒。` : `${whose}跑到了國外。`
  return `${whose}繞了 ${n(km)} 公里` + (ms != null ? `，連線來回多了 ${n(ms)} 毫秒。` : '。')
}
// No "you": the same plain line serves someone else's result.
const greenSub = (ms: number | null) => (ms != null ? `連線在台灣就近完成，來回約 ${n(ms)} 毫秒。` : '連線在台灣就近完成。')
const blueSub = (whose: string) => (pct: number | null) =>
  '這是正常的就近連線。' + (pct != null ? `對照：台灣中華電信 HiNet 用戶有 ${pct}% 落在美國。` : '') + `${whose}列入國際對照組，不計入台灣統計。`

// The privacy note, shown in full on the methodology page (/methodology#privacy).
const privacy =
  '我們不儲存你的 IP。為了防止重複送出，會把 IP 與裝置編號加上日期後算出雜湊值，保存 48 小時，之後從資料庫清除，資料庫備份最多再保留 30 天。伺服器的請求日誌是關閉的，日誌裡不會有你的 IP。每次測試只記錄電信公司、縣市、落地節點、延遲、裝置時區與連線類型，用於全台匿名統計。公開下載的只有每日彙整的統計，不含任何單筆測試；同一天同一家電信少於 3 筆的落地機房會合併計算。你可以隨時關閉「共享數據」，關閉時不儲存任何資料。網站字型由 Google Fonts 提供，載入字型時你的瀏覽器會連到 Google。'

export const zh = {
  htmlLang: 'zh-Hant-TW',
  ogLocale: 'zh_TW',
  name: '網路出國了嗎？',
  brand: 'Detour',
  nav: {
    how: '怎麼量的？',
    stats: '全台統計',
    home: '回首頁',
    menu: '主選單',
    switchTo: 'Switch to English',
    switchShort: 'EN',
    skip: '跳到主要內容',
  },
  langBanner: {
    text: 'This site is also available in English.',
    go: 'Read in English',
    dismiss: '關閉',
  },
  meta: {
    homeTitle: '網路出國了嗎？— 測你的連線在哪裡落地｜Detour',
    homeDesc:
      '3 秒測出你的網路連往 Cloudflare 網站時在哪個城市落地、多繞了幾公里、多了多少延遲。匿名結果累積成全台公開數據。',
    statsTitle: '台灣的連線統計｜Detour',
    statsDesc:
      '各電信用戶連往 Cloudflare 一般方案網站的落地城市比例、延遲中位數、各縣市出國率與近 30 天趨勢。數據可下載，CC BY 4.0。',
    methodTitle: '測試方法：我們怎麼量連線落地點｜Detour',
    methodDesc:
      '量測方式、對照組、防灌票機制、隱私與資料授權，以及 Cloudflare 每個機房代碼代表的城市。',
    resultTitle: (city: string) => `我的連線在${city}落地｜網路出國了嗎？`,
    resultDesc: (city: string, isp: string) =>
      `${isp}用戶的連線在${city}落地。測測你的網路有沒有出國？`,
    notFoundTitle: '找不到這筆結果｜網路出國了嗎？',
    pageNotFoundTitle: '找不到這個頁面｜網路出國了嗎？',
    appName: '網路出國了嗎？',
    datasetName: '台灣各電信連往 Cloudflare 的落地節點統計',
    datasetDesc:
      '在台灣使用台灣電信網路的匿名測試，按日彙整：每天、每家電信、每個落地機房的測試數、占該電信當天測試的比例，以及實測延遲、台灣節點延遲與多出延遲的中位數。只計入通過防灌票與物理檢查的測試；當天少於 3 筆的機房併成 OTHER。',
  },
  measure: {
    steps: ['正在追蹤你的連線…', '它好像要搭飛機了…', '落地了！'],
    hint: '量 5 次來回時間，大約 3 秒。',
    failed: '測試沒完成，可能是網路不穩，再試一次？',
    rate: '測太多次了，請等一分鐘再試。',
    offline: '你好像離線了。連上網路後再試一次？',
    retry: '再試一次',
    retest: '重新測試',
    again: '再測一次',
    noscript: '這個測試需要開啟 JavaScript 才能在你的瀏覽器量測。',
  },
  status: {
    green: '沒繞路',
    yellow: '小繞一下',
    red: '出國了',
    gray: '結果可能不準',
    blue: '海外連線',
    pending: '測試中',
    error: '測試沒完成',
  },
  card: {
    title: {
      green: (city: string) => `你的連線在${city}落地`,
      yellow: (city: string) => `小繞一下，你的連線去了${city}`,
      red: (city: string) => `你的網路出國了：${city}`,
      gray: () => '這次的結果可能不代表你家的網路',
      blue: (city: string, country: string) => `你在${country}，連線在${city}落地`,
    },
    sub: {
      green: greenSub,
      yellow: yellowSub,
      red: redSub('你的連線'),
      gray: '你好像在用 VPN 或公司網路。關掉後再測一次，數據才準。',
      blue: blueSub('你的結果會'),
    },
    /** Someone else's result, opened from its link: nothing of the visitor's was measured. */
    shared: {
      title: {
        green: (city: string) => `這條連線在${city}落地`,
        yellow: (city: string) => `小繞一下，這條連線去了${city}`,
        red: (city: string) => `這個網路出國了：${city}`,
        gray: () => '這次的結果可能不代表一般的家用網路',
        blue: (city: string, country: string) => `從${country}測試，連線在${city}落地`,
      },
      sub: {
        green: greenSub,
        yellow: yellowSub,
        red: redSub('這條連線'),
        gray: '測試者好像在用 VPN 或公司網路，數據可能不準。',
        blue: blueSub('這筆結果'),
      },
      you: '測試地點',
      network: '測試網路',
    },
    roaming: '你好像不在台灣，延遲會偏高。這次不計入台灣統計。',
    foreignSim: '你好像人在台灣、用的是外國門號（例如旅遊 eSIM），所以列入國際對照組。',
    suspicious: '這次的數字有點不尋常，照常顯示，但不計入統計。',
    optOut: '你關閉了共享數據，這次沒有儲存任何資料。',
    you: '你在',
    youValue: (region: string) => `${region}（大約位置）`,
    network: '你的網路',
    landing: '連線節點',
    latency: '實測延遲',
    ms: '毫秒',
    km: '公里',
    // Measured to cloudflare.com in the same test, not estimated; the code is where it landed.
    taiwanNode: (iata?: string) => (iata ? `台灣節點 ${iata}` : '台灣節點延遲'),
    landingDc: '落地機房',
    testedAt: '測試時間',
    viaRef: (iata: string) => `對照路線（${iata}）`,
    nearest: (iata?: string) => (iata ? `就近節點 ${iata}` : '就近節點'),
    extraMsHero: '每次來回多',
    // The whole way to the landing data center, not the extra; sublines speak of the detour.
    distanceLabel: '連線走了',
    unknownRegion: '不明',
    actions: {
      stats: '看看全台狀況',
      share: '分享結果',
      why: '為什麼會這樣？',
      whose: '這是誰的問題？',
      retest: '重新測試',
      family: '傳給台灣的家人朋友測測看',
    },
    contribute: '共享數據',
  },
  map: {
    label: (from: string, to: string) => `連線路線地圖：從${from}到${to}`,
    labelPending: '連線路線地圖：正在追蹤',
    you: '你',
    taiwan: '台灣',
  },
  share: {
    heading: '分享結果',
    close: '關閉',
    layoutLabel: '圖片版型',
    layoutStory: '直式',
    layoutWide: '橫式',
    previewAlt: '結果圖預覽',
    preparing: '正在產生結果圖…',
    imageFailed: '結果圖暫時產生不出來，先用連結或文字分享。',
    shareImage: '分享這張圖',
    download: '下載圖片',
    copyLink: '複製連結',
    linkCopied: '已複製連結',
    copyFailed: '複製失敗，請手動選取',
    noId: '你關閉了「共享數據」，這次的結果沒有儲存。結果連結和結果圖要有儲存的結果才做得出來，但文字還是可以直接分享。',    contributeAndShare: '開啟共享數據並重測，產生連結和圖',
    textOnly: '只分享文字',
    text: {
      out: (city: string, km: number | null, url: string) =>
        `我的網路出國了，連到${city}` + (km != null ? `，多繞 ${n(km)} 公里` : '') + `。你的呢？${url}`,
      home: (city: string, url: string) => `我的網路沒出國，在${city}落地。來測測你家的？${url}`,
      generic: (url: string) => `你的網路出國了嗎？測一次就知道：${url}`,
    },
    // Passing on someone else's result: about that connection, not "mine".
    textShared: {
      out: (city: string, km: number | null, url: string) =>
        `這個網路出國了，連到${city}` + (km != null ? `，多繞 ${n(km)} 公里` : '') + `。你的呢？${url}`,
      home: (city: string, url: string) => `這個網路沒出國，在${city}落地。來測測你家的？${url}`,
    },
    shareTitle: '網路出國了嗎？',
  },
  stats: {
    heading: '全台即時統計',
    domestic: '台灣',
    yellow: '鄰近地區',
    red: '遠方',
    trend: '近 30 天在台灣落地的比例',
    more: '看完整統計報告',
    empty: '數據統計中',
    unavailable: '統計暫時讀不到，稍後再來看看。',
    lowSample: '樣本不足',
  },
  why: {
    heading: '為什麼會這樣',
    you: '你',
    trip: {
      title: '上網，其實是一來一回',
      body: [
        '你每打開一個網頁，瀏覽器就會送出請求，再等對方把內容送回來。一個網頁通常要送出幾十個請求，其中不少得等前一個回來才能接著送。打開之後，你的每次點擊、捲動、輸入，也還在跟伺服器來回溝通。所以每一趟來回要花多久，決定了網頁快不快。',
      ],
      site: '網站',
      ask: '請求網頁',
      answer: '回應內容',
      alt: '示意圖：手機送出請求，網站把內容送回來',
    },
    web: {
      title: '回應你的，通常不是網站本身，而是 Cloudflare',
      body: [
        '全世界有將近 30% 的網站透過 Cloudflare 提供服務。Cloudflare 提供安全防護、快取、邊緣運算等功能。你連上這些網站時，其實是先連到 Cloudflare 的機房，由離你最近的機房直接回應，或代你向網站取得內容。',
      ],
      // Leads into the next step.
      but: 'Cloudflare 在台北和高雄都有機房，照理說，你的請求在台灣就能得到回應。但是⋯⋯',
      near: 'Cloudflare',
      origin: '實際網站',
      alt: '示意圖：你的大部分請求由 Cloudflare 直接回應，只有少數會再轉給實際網站',
    },
    peer: {
      title: '請求去哪個機房，要看業者和 Cloudflare 在哪裡接線',
      body: [
        'Cloudflare 全球的機房共用同一組 IP 位址。你的請求最後被送到哪一個機房，取決於你的網路業者（ISP）怎麼安排路線，而業者只能把流量交到它和 Cloudflare 有直接接線的地方。',
        '如果網路業者和 Cloudflare 沒有在台灣互連，或者沒有讓一般流量走這條路，請求就會先出國，在美國等地才交給 Cloudflare，回應再一路繞回台灣。',
      ],
      direct: '正常連線',
      detour: '繞路連線',
      isp: 'ISP',
      taipei: '台北',
      pacific: '太平洋',
      joined: '在台灣互連',
      notJoined: '在台灣不互連',
      // Sits above the far end of the detour; a longer city name would run into the route's arc.
      joinedFar: (city: string) => (city.length > 6 ? '在國外互連' : `在${city}互連`),
      alt: {
        direct: '示意圖：請求在台灣交給 Cloudflare，由台北機房回覆',
        detour: (city: string) => `示意圖：請求跨過太平洋，到${city}才交給 Cloudflare`,
        detourNear: (city: string) => `示意圖：請求離開台灣，到${city}才交給 Cloudflare`,
      },
      ms: (v: string) => `連線約 ${v} 毫秒`,
      measured: '實際數字',
      example: '示意數字',
    },
    cost: {
      title: '多繞的這一段，每一趟都要付出代價',
      items: [
        {
          icon: 'slow',
          h: '每一趟都變慢',
          p: '台北到洛杉磯大約一萬公里。就算訊號以光速在光纖裡跑，來回一趟物理上也至少要 0.1 秒；如果在台灣落地，通常只要幾毫秒。一個網頁要來回幾十趟，累積起來就是你感受到的「怎麼這麼慢」。',
        },
        {
          icon: 'twice',
          h: '網站明明在台灣，卻要過兩次太平洋',
          p: '很多台灣網站的伺服器就在台灣或亞洲。登入、結帳、搜尋這類要即時處理的請求，Cloudflare 必須轉給網站本身。於是你的請求先飛到美國，再從美國飛回台灣找伺服器，回應又照原路飛回去：本來在島內就能完成的事，變成橫跨太平洋兩次。',
        },
        {
          icon: 'faster',
          h: '美國人拿台灣網站，比你還快',
          p: 'Cloudflare 會把網站內容存在各地機房。美國的使用者連到台灣網站，可以直接從當地機房拿到內容；你人在台灣，卻也得跑去美國的機房拿。同一個台灣網站，台灣人反而比較慢。',
        },
        {
          icon: 'cable',
          h: '大家擠同一條海底電纜',
          p: '被送出國的流量，都要擠進有限的國際海纜頻寬。晚上上網的尖峰時段最容易塞車，一塞就掉封包，掉了就得重送，而每次重送又要再跑一趟太平洋。下載大檔案、看影片時，你感受到的就是卡頓和降畫質。',
        },
        {
          icon: 'unfair',
          h: '小公司比大公司吃虧',
          p: 'Cloudflare 的路由優先權只給最高等級的企業方案，依照流量每個月最少 3000 美金。付得起的大公司可以走台北，付不起的新創、小店家、個人網站只能繞路。在同一個市場上，速度一開始就不公平。',
        },
        {
          icon: 'shield',
          h: '為了速度，只好拿掉防護',
          p: 'Cloudflare 不只是加速，它同時擋 DDoS 攻擊、過濾惡意流量、阻擋機器人，還能把網站真正的伺服器位址藏起來。可是繞路的問題逼網站做選擇，是否要犧牲防護來讓用戶連線變快，直接對外開放。速度回來了，但防護也一起沒了。',
        },
      ] as { icon: 'slow' | 'twice' | 'faster' | 'cable' | 'unfair' | 'shield'; h: string; p: string }[],
    },
  },
  act: {
    heading: '你可以做什麼',
    ask: '我們的訴求：請中華電信、Cloudflare 在台灣提供直接互連，或提供台灣附近亞洲區域的節點，讓台灣網路使用者不用忍受高延遲的網路。',
    ispTitle: '向你的電信公司反映',
    chtLink: '中華電信',
    chtLinkName: '中華電信意見信箱',
    govTitle: '寫信給主管機關',
    nccLink: 'NCC',
    nccLinkName: 'NCC 寫信給我們',
    modaLink: '數位發展部',
    modaLinkName: '數位發展部民意信箱',
    cfTitle: '向 Cloudflare 反映',
    cfLink: 'Cloudflare',
    cfLinkName: 'Cloudflare 聯絡／支援',
    newTab: (name: string) => `${name}（另開新分頁）`,
  },
  footer: {
    method: '測試方法',
    stats: '統計報告',
    license: '數據以 CC BY 4.0 授權',
    source: '原始碼',  },
  report: {
    eyebrow: '統計報告',
    title: '台灣的連線統計',
    lead: (days: number) =>
      `近 ${days} 天，人在台灣、用台灣電信網路的匿名測試。`,
    updated: (t: string) => `更新時間：${t}`,
    ispHeading: '連線狀況',
    ispCols: {
      isp: '網路服務供應商',
      n: '樣本數',
      domestic: '台灣節點',
      lights: '燈號分布',
      rtt: '延遲中位數',
      ref: '台灣節點延遲',
      extra: '多出延遲中位數',
      top: '最常連線',
    },
    coloHeading: '各服務商連線狀況',
    daily: {
      caption: (days: number) => `近 ${days} 天每日分布`,
      label: (isp: string, days: number) => `${isp}近 ${days} 天每日連線節點分布`,
      day: (date: string, n: string, shares: string) => `${date}：${n} 次測試，${shares}`,
      none: (date: string) => `${date}：沒有測試`,
      few: '（樣本不足）',
    },
    intlHeading: '國際用戶連線狀況',
    intlCols: { country: '國家／地區', n: '樣本數', dist: '落地距離中位數', top: '最常連線' },
    empty: '還沒有足夠的數據可以出報告。',
    unavailable: '統計暫時讀不到，稍後再試。',
    other: '其他',
  },
  method: {
    eyebrow: '測試方法',
    title: '我們怎麼量',
    lead: '所有量測都在你的瀏覽器裡完成，方法與數據全部公開。',
    sections: [
      {
        id: 'targets',
        h: '兩個量測對象',
        p: [
          '本站（detour.tw）部署在 Cloudflare 的免費方案上。你的瀏覽器連到 detour.tw/cdn-cgi/trace 時，回應會寫出接你的機房代碼，這就是一般 Cloudflare 網站對你的「落地點」。',
          '同時量 cloudflare.com/cdn-cgi/trace。cloudflare.com 是 Cloudflare 自己的網站，在台灣通常就在台灣的機房落地，所以拿它當「理想路線」的對照，也就是結果卡上的「台灣節點延遲」。這是每次測試當下實際量到的數字，不是推估。',
        ],
      },
      {
        id: 'procedure',
        h: '量測步驟',
        p: [
          '先跟伺服器拿一張一次性的簽章票，再對兩個對象各做 1 次暖機連線、5 次計時連線，兩邊交錯進行（本站、對照、本站、對照…），讓瞬間的網路壅塞同時影響兩邊。',
          '每次連線都停用快取並加上隨機參數，計時從送出請求到讀完回應。每次最多等 4 秒，整個測試最多 15 秒。延遲取 5 次的中位數，避免單次異常拉高結果。',
        ],
      },
      {
        id: 'checks',
        h: '防灌票與合理性檢查',
        p: [
          '票券經過加密簽章、只能用一次，而且要在發出後 2 到 120 秒之間送回，並綁定同一個連線來源。',
          '物理檢查：光在光纖中每毫秒約走 200 公里，來回時間不可能低於距離換算出的下限。伺服器也會比對它自己看到的 TCP 來回時間。數字不合理的測試照常顯示，但不計入統計。',
          '同一台裝置每天只計一次。裝置識別碼存在瀏覽器裡，清掉就會被當成新裝置，所以這只能盡量做到。',
          '同一個 IP 每天最多計 20 次，IPv6 以 /64 網段為一個單位（一個家庭通常分到一整段），速率限制也一樣。手機網路常有很多人共用一個 IP，所以行動網路的測試可能被少算。',
        ],
      },
      {
        id: 'excluded',
        h: '哪些測試不計入，為什麼',
        p: [
          '只有「人在台灣、用台灣電信」的測試計入台灣統計。人在國外、旅遊 eSIM、漫遊、VPN、公司網路、雲端機房的測試都會照常顯示，但另外分類：海外與旅遊 eSIM 列入國際對照組，其他不計入。',
          '關閉「共享數據」的測試完全不儲存。',
        ],
      },
      {
        id: 'limits',
        h: '限制',
        p: [
          '縣市位置來自 IP 地理資料庫，可能有誤差。行動網路尤其明顯：電信商的 IP 常登記在台北，所以各縣市統計會偏向台北市。電信公司以 ASN 判斷，部分小型業者可能歸在「其他」。',
          'cloudflare.com 不是完美的對照：它是企業方案網站，路由可能和其他企業方案網站不同。「台灣節點延遲」是 cloudflare.com 的實測值，代表一個走台灣節點的網站有多快，不保證每個網站走台灣節點時都一樣快。',
          '瀏覽器量到的時間包含 TLS、HTTP 處理與瀏覽器本身的延遲，所以會比一般測速工具量到的稍高。兩個對象用同一種方法量，彼此可以比較。',
          '延遲是你的瀏覽器量的，再由瀏覽器回報。伺服器只能檢查數字是否合理，無法逐筆驗證，所以「延遲中位數」與「多出延遲中位數」都是用使用者端回報的數值算出來的。',
          '自願參加的測試不是隨機抽樣，樣本可能偏向關心這個議題的使用者。',
        ],
      },
    ],
    ispHeading: '電信怎麼分組',
    ispLead: '統計以 ASN（自治系統號碼）判斷電信公司，再歸到一般人認得的品牌。登記名稱在不同資料庫寫法不一，所以不用名稱判斷。',
    ispNotes: [
      '中華電信的 HiNet 固網（AS3462）與行動網路（AS17421）分開統計。',
      '台灣之星已於 2023 年 12 月併入台灣大哥大，舊的 AS24157 歸在台灣大哥大。',
      '亞太電信已於 2023 年 12 月併入遠傳電信。舊網路仍可分辨，所以另列一組。',
      '台灣大哥大的行動網路（AS24158）和台灣大寬頻（AS24163–24165）分開統計。',
      '學術網路與政府網路各自一組。雲端機房、VPN、iCloud 私密轉送、WARP 等不是家用連線，一律列為灰燈，不計入統計。',
      '沒有對應到品牌的台灣 ASN 歸在「其他台灣網路」。',
    ],
    ispCols: { isp: '品牌', asns: 'ASN' },
    privacyHeading: '隱私',
    privacy,
    licenseHeading: '數據授權',
    download: '下載每日統計（CSV）',
    // The address follows as a link.
    contactLead: '數據或方法的問題，請寫信到',
    licenseBody: '統計數據以 CC BY 4.0 授權，可自由轉載與再利用，請註明來源「網路出國了嗎？（detour.tw）」。',
    dataBody:
      '可下載的是每日統計，不含單筆測試。每一列是一天（台北時間）、一家電信、一個落地機房：計入的測試數、占該電信當天測試的比例，以及實測延遲、台灣節點延遲與多出延遲各自的中位數。同一天同一家電信少於 3 筆的機房併成一列 OTHER；OTHER 本身少於 3 筆時不列中位數，避免單一使用者的測試被認出來。',
    datedBody:
      '/api/export.csv 包含所有日期，每小時更新。每一天結束後，另有一份只含當天、之後不再變動的檔案（/api/export/年-月-日.csv，例如 /api/export/2026-11-13.csv），引用時可以指向它。',
    openSource: '方法與程式碼公開',
    coloHeading: 'Cloudflare 機房代碼對照表',
    coloLead: (count: number) =>
      `Cloudflare 用機場代碼（IATA）命名機房。下表列出 ${count} 個機房代表的城市，結果卡上的「連線節點」就是用這張表翻譯的。`,
    coloSearch: '搜尋城市、國家或代碼',
    coloCols: { iata: '代碼', city: '城市', country: '國家／地區', region: '區域' },
    coloCount: (shown: number, total: number) => `顯示 ${shown} / ${total} 個`,
    regions: {
      asia: '亞洲',
      oceania: '大洋洲',
      'north-america': '北美洲',
      'south-america': '中南美洲',
      europe: '歐洲',
      'middle-east': '中東',
      africa: '非洲',
    } as Record<string, string>,
  },
  result: {
    cta: '測測我的網路',
    notFound: '找不到這筆結果',
    errorTitle: '暫時讀不到這筆結果',
    errorBody: '伺服器可能正忙，稍後重新整理看看。你也可以直接測自己的。',
    notFoundBody: '連結可能打錯了，或這筆結果不存在。你可以直接測自己的。',
  },
  notFound: { title: '找不到這個頁面', body: '網址可能打錯了。回首頁測測你的連線。' },
  unknownColo: '未知位置',
  listSep: '、',
  sentenceSep: '。',
  exportNotReady: '資料匯出準備中，請稍後再試。',
  breadcrumbHome: '首頁',
}

export type Dict = typeof zh
