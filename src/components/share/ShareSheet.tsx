import { useEffect, useRef, useState } from 'react'
import { getDict } from '#/i18n'
import type { Lang, TestResult } from '#/lib/types'
import { CheckIcon, CloseIcon, DownloadIcon, LinkIcon, ShareIcon } from '../icons'
import { IMAGE_SIZE, canShareFile, copyToClipboard, fetchImageFile, imageUrl, nativeShare, shareText, shareUrl } from './share'
import type { ImageLayout } from './share'

interface Props {
  lang: Lang
  open: boolean
  onClose: () => void
  result: TestResult
  /** Stores this result (re-runs the test with contribution on) so it gets a link and an image. */
  onContribute?: () => void
  /** Someone else's result (a shared link): the text passes it on in the third person. */
  shared?: boolean
}

const CLOSE_MS = 160

export function ShareSheet({ lang, open, onClose, result, onContribute, shared }: Props) {
  const t = getDict(lang).share
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  const close = () => {
    const el = dialog.current
    if (!el || el.hasAttribute('data-closing')) return
    el.setAttribute('data-closing', '')
    setTimeout(() => {
      el.removeAttribute('data-closing')
      onClose()
    }, CLOSE_MS)
  }

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="sheet-h"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close()
      }}
    >
      {/* Mounted only while open, so the image is not rendered for visitors who never share. */}
      {open && (
        <div className="sheet-body">
          <header className="sheet-head">
            <h2 id="sheet-h">{t.heading}</h2>
            <button type="button" className="icon-btn" onClick={close} aria-label={t.close}>
              <CloseIcon />
            </button>
          </header>
          <SheetContent lang={lang} result={result} onContribute={onContribute} shared={shared} />
        </div>
      )}
    </dialog>
  )
}

function SheetContent({ lang, result, onContribute, shared }: Pick<Props, 'lang' | 'result' | 'onContribute' | 'shared'>) {
  const t = getDict(lang).share
  // Phones post stories; a desktop preview is more useful in the link-preview shape.
  const [layout, setLayout] = useState<ImageLayout>(() => (window.matchMedia('(min-width: 720px)').matches ? 'wide' : 'story'))
  const [loaded, setLoaded] = useState<Partial<Record<ImageLayout, 'ready' | 'failed'>>>({})
  // Image files are fetched ahead of the tap: navigator.share must run inside the user gesture.
  const files = useRef<Partial<Record<ImageLayout, File>>>({})
  const canNative = typeof navigator.share === 'function'
  const id = result.id
  const optedOut = result.notCountedReason === 'opt-out'
  const [copied, setCopied] = useState<'copied' | 'failed' | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(copyTimer.current), [])

  useEffect(() => {
    if (!id || files.current[layout]) return
    let stale = false
    fetchImageFile(id, layout, lang).then(
      (file) => {
        if (!stale) files.current[layout] = file
      },
      () => undefined,
    )
    return () => {
      stale = true
    }
  }, [id, layout, lang])

  const url = shareUrl(location.origin, lang, result)
  const text = shareText(lang, result, url, shared)
  const bare = shareText(lang, result, '', shared)
  const size = IMAGE_SIZE[layout]
  const imageState = loaded[layout] ?? 'loading'
  const mark = (state: 'ready' | 'failed') => setLoaded((s) => ({ ...s, [layout]: state }))

  const shareImage = async () => {
    const file = files.current[layout] ?? null
    if (canShareFile(file) && (await nativeShare({ files: [file!], title: t.shareTitle, text }))) return
    await nativeShare({ title: t.shareTitle, text: bare, url })
  }

  const copyLink = async () => {
    const ok = await copyToClipboard(url)
    setCopied(ok ? 'copied' : 'failed')
    clearTimeout(copyTimer.current)
    // A failure stays up longer: the visitor has to select the link in the text below themselves.
    copyTimer.current = setTimeout(() => setCopied(null), ok ? 2000 : 4000)
  }

  return (
    <>
      {id && (
        <>
          <div className="seg" role="group" aria-label={t.layoutLabel}>
            <button type="button" aria-pressed={layout === 'story'} onClick={() => setLayout('story')}>
              {t.layoutStory}
            </button>
            <button type="button" aria-pressed={layout === 'wide'} onClick={() => setLayout('wide')}>
              {t.layoutWide}
            </button>
          </div>

          <div className="sheet-preview" data-layout={layout} data-state={imageState}>
            <img
              key={layout}
              // A cached image can be complete before React attaches onLoad.
              ref={(img) => {
                if (img?.complete && img.naturalWidth > 0 && imageState === 'loading') mark('ready')
              }}
              src={imageUrl(id, layout, lang)}
              alt={t.previewAlt}
              width={size.width}
              height={size.height}
              onLoad={() => mark('ready')}
              onError={() => mark('failed')}
            />
            {imageState === 'loading' && <p className="sheet-preview-note">{t.preparing}</p>}
            {imageState === 'failed' && <p className="sheet-preview-note">{t.imageFailed}</p>}
          </div>

          <div className="sheet-primary">
            {canNative && (
              <button type="button" className="btn btn-primary" onClick={shareImage}>
                <ShareIcon />
                {t.shareImage}
              </button>
            )}
            {/* Without the system share sheet (most desktops) the link is what gets passed on. */}
            {!canNative && (
              <button type="button" className="btn btn-primary" onClick={copyLink} data-copied={copied === 'copied' ? '' : undefined}>
                {copied === 'copied' && <CheckIcon />}
                {copied !== 'copied' && <LinkIcon />}
                <span aria-live="polite">
                  {copied === 'copied' && t.linkCopied}
                  {copied === 'failed' && t.copyFailed}
                  {!copied && t.copyLink}
                </span>
              </button>
            )}
            <a className="btn" href={imageUrl(id, layout, lang)} download={`detour-${id}-${layout}.png`}>
              <DownloadIcon />
              {t.download}
            </a>
          </div>
        </>
      )}

      {!id && (
        <div className="sheet-noid">
          {/* Only an opt-out is fixed by turning "Share data" on; other unstored results just need a retest. */}
          <p>{optedOut ? t.noId : t.noIdUnsaved}</p>
          {optedOut && onContribute && (
            <button type="button" className="btn btn-primary" onClick={onContribute}>
              {t.contributeAndShare}
            </button>
          )}
          {canNative && (
            <button type="button" className="btn" onClick={() => nativeShare({ title: t.shareTitle, text: bare, url })}>
              <ShareIcon />
              {t.textOnly}
            </button>
          )}
        </div>
      )}

      <p className="sheet-text">{text}</p>
    </>
  )
}
