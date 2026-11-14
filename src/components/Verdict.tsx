import { getDict } from '#/i18n'
import type { Lang } from '#/lib/types'
import { headline } from './result-model'
import type { TestState } from './result-model'

interface Props {
  lang: Lang
  state: TestState
  /** Share of Chunghwa Telecom tests landing in the US (0..1), quoted on the overseas result. */
  chtUsShare: number | null
  /** The verdict is the page heading on a result page, a section heading on the home page. */
  as?: 'h1' | 'h2'
  /** A finished result shown as it is: no swap animation. */
  still?: boolean
  /** Someone else's result (a shared link): told in the third person. */
  shared?: boolean
}

/**
 * The headline of the hero: what is happening, then what happened. It sits on the sea in a
 * block of fixed height, so a longer sentence takes up spare water instead of moving the page.
 */
export function Verdict({ lang, state, chtUsShare, as: Heading = 'h2', still, shared }: Props) {
  const { status, title, sub } = headline(state, lang, chtUsShare, shared)
  // While the test runs, one polite live region speaks for the changing text; a finished
  // result is plain content.
  const hidden = still ? undefined : true
  return (
    <div className="says" data-still={still ? '' : undefined}>
      {!still && (
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {status}
          {getDict(lang).sentenceSep}
          {title} {state.phase === 'done' ? sub : ''}
        </p>
      )}
      <Heading className="says-title" aria-hidden={hidden}>
        <span key={title} className="swap">
          {title}
        </span>
      </Heading>
      <p className="says-sub" aria-hidden={hidden}>
        <span key={sub} className="swap">
          {sub}
        </span>
      </p>
    </div>
  )
}
