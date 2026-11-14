import { getDict } from '#/i18n'
import type { Lang, StatsResponse, TestResult } from '#/lib/types'
import { actTemplates } from './act-templates'
import { ExternalIcon } from './icons'
import { CONTACT_URL } from './links'

interface ActProps {
  lang: Lang
  result: TestResult | null
  stats: StatsResponse | null
  /** The result is someone else's, opened from its link. */
  shared?: boolean
}

interface LetterProps {
  lang: Lang
  title: string
  text: string
  textLang: 'zh-Hant-TW' | 'en'
  /** `label` is the short text on the button; `name` says what opens, for screen readers. */
  links: { href: string; label: string; name: string }[]
}

/** One recipient: the message to select and copy, then the form to paste it into. */
function Letter({ lang, title, text, textLang, links }: LetterProps) {
  const d = getDict(lang)
  return (
    <article className="act-item">
      <h3>{title}</h3>
      <p className="template" lang={textLang}>
        {text}
      </p>
      <div className="btn-row">
        {links.map((l) => (
          <a key={l.href} className="btn" href={l.href} target="_blank" rel="noopener noreferrer" aria-label={d.act.newTab(l.name)}>
            {l.label}
            <ExternalIcon />
          </a>
        ))}
      </div>
    </article>
  )
}

export function ActSection({ lang, result, stats, shared = false }: ActProps) {
  const d = getDict(lang)
  const t = d.act
  const letters = actTemplates(result, stats, shared)
  return (
    <section id="act" className="section section-paper" aria-labelledby="act-h">
      <div className="wrap">
        <div className="section-head">
          <h2 id="act-h">{t.heading}</h2>
          <p className="ask">{t.ask}</p>
        </div>
        <div className="act-grid">
          <Letter
            lang={lang}
            title={t.ispTitle}
            text={letters.isp}
            textLang="zh-Hant-TW"
            links={[{ href: CONTACT_URL.cht, label: t.chtLink, name: t.chtLinkName }]}
          />
          <Letter
            lang={lang}
            title={t.govTitle}
            text={letters.regulator}
            textLang="zh-Hant-TW"
            links={[
              { href: CONTACT_URL.ncc, label: t.nccLink, name: t.nccLinkName },
              { href: CONTACT_URL.moda, label: t.modaLink, name: t.modaLinkName },
            ]}
          />
          <Letter
            lang={lang}
            title={t.cfTitle}
            text={letters.cloudflare}
            textLang="en"
            links={[{ href: CONTACT_URL.cloudflare, label: t.cfLink, name: t.cfLinkName }]}
          />
        </div>
      </div>
    </section>
  )
}
