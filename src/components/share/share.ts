import { coloCity, getDict, pathFor } from '#/i18n'
import type { Lang, TestResult } from '#/lib/types'
import { detourKm } from '../result-model'

export type ImageLayout = 'story' | 'wide'

export const IMAGE_SIZE: Record<ImageLayout, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  wide: { width: 1200, height: 630 },
}

/** Link to share: the stored result when there is one, otherwise the home page. */
export function shareUrl(origin: string, lang: Lang, r: TestResult | null): string {
  return origin + pathFor(r?.id ? `/r/${r.id}` : '/', lang)
}

/**
 * Brief templates per state; `url` is appended by the template (pass '' for services that take
 * it separately). `shared`: passing on someone else's result, told in the third person.
 */
export function shareText(lang: Lang, r: TestResult | null, url: string, shared = false): string {
  const s = getDict(lang).share
  const t = shared ? { ...s.text, ...s.textShared } : s.text
  let text = t.generic(url)
  if (r && r.light === 'green') text = t.home(coloCity(r.landing.iata, lang), url)
  if (r && (r.light === 'yellow' || r.light === 'red')) text = t.out(coloCity(r.landing.iata, lang), detourKm(r), url)
  return text.trim()
}

export function imageUrl(id: string, layout: ImageLayout, lang: Lang): string {
  return `/api/og/${id}.png?layout=${layout}&lang=${lang}`
}

export async function fetchImageFile(id: string, layout: ImageLayout, lang: Lang): Promise<File> {
  const res = await fetch(imageUrl(id, layout, lang))
  if (!res.ok) throw new Error(`image ${res.status}`)
  const blob = await res.blob()
  return new File([blob], `detour-${id}-${layout}.png`, { type: 'image/png' })
}

export function canShareFile(file: File | null): boolean {
  if (!file || typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API needs a secure context and permission; the hidden-textarea path covers the rest.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    return ok
  }
}

/** True when the share completed or the visitor dismissed the sheet; false when sharing is unavailable. */
export async function nativeShare(data: ShareData): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false
  try {
    await navigator.share(data)
    return true
  } catch (e) {
    return (e as Error).name === 'AbortError'
  }
}
