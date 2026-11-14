import { useEffect, useState } from 'react'
import { KEYS, readStore, writeStore } from '#/client/storage'
import { getDict, pathFor } from '#/i18n'
import type { Lang } from '#/lib/types'
import { CloseIcon } from './icons'

/**
 * Suggests the other language instead of redirecting (redirects by Accept-Language hurt
 * crawlers). Floats at the bottom so it never pushes the result card.
 */
export function LangBanner({ lang, pathname }: { lang: Lang; pathname: string }) {
  const [other, setOther] = useState<Lang | null>(null)

  useEffect(() => {
    if (readStore(KEYS.langBanner) === '1') return
    const stored = readStore(KEYS.lang)
    const preferred: Lang = stored === 'zh' || stored === 'en' ? stored : /^zh\b/i.test(navigator.language) ? 'zh' : 'en'
    if (preferred !== lang) setOther(preferred)
  }, [lang])

  if (!other) return null
  // Each dictionary's banner copy is written in the *other* language, for readers of that language.
  const t = getDict(lang).langBanner
  const dismiss = () => {
    writeStore(KEYS.langBanner, '1')
    setOther(null)
  }
  return (
    <div className="lang-banner" lang={getDict(other).htmlLang} role="region" aria-label={t.text}>
      <p>{t.text}</p>
      <a href={pathFor(pathname, other)} onClick={() => writeStore(KEYS.lang, other)}>
        {t.go}
      </a>
      <button type="button" className="icon-btn" onClick={dismiss} aria-label={t.dismiss}>
        <CloseIcon />
      </button>
    </div>
  )
}
