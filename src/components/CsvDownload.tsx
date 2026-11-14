import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { getDict } from '#/i18n'
import type { Lang } from '#/lib/types'

const URL = '/api/export.csv'

/**
 * The CSV download. Until the first hourly export after a deploy the file does not exist and
 * the server answers 503 (or it may fail for a moment): say so instead of handing the browser a
 * broken download.
 */
export function CsvDownload({ lang, className, children }: { lang: Lang; className?: string; children: ReactNode }) {
  const [notReady, setNotReady] = useState(false)

  const onClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    try {
      const res = await fetch(URL)
      void res.body?.cancel()
      // Any error answer (503 before the first export, or a transient 5xx/429) is JSON, not a
      // file: following it would leave the visitor on a raw error page.
      if (!res.ok) {
        setNotReady(true)
        return
      }
    } catch {
      // Unreachable now; the browser's own download attempt will report it.
    }
    setNotReady(false)
    window.location.href = URL
  }

  return (
    <>
      <a className={className} href={URL} download onClick={onClick}>
        {children}
      </a>
      <span className="csv-note" role="status">
        {notReady && getDict(lang).exportNotReady}
      </span>
    </>
  )
}
