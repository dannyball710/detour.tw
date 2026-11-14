import type { ReactNode } from 'react'
import type { Light } from '#/lib/types'

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export type LampKind = Light | 'pending' | 'error'

const dot = (cx: number) => <circle cx={cx} cy="12" r="1.3" fill="currentColor" stroke="none" />

// Every light has its own shape, so the state survives without colour.
const LAMP: Record<LampKind, ReactNode> = {
  green: <path d="m7 12.5 3.2 3.2L17 8.8" />,
  yellow: <path d="M6 16.5h4.5a4 4 0 0 0 4-4V7m0 0-3 3m3-3 3 3" />,
  red: <path d="M4.5 13.2 19 6.5l-5.6 12.3-2.2-5-5-2.2z" fill="currentColor" stroke="none" />,
  gray: <path d="M9.2 9.3a2.9 2.9 0 1 1 4.2 2.6c-.9.5-1.4 1.1-1.4 2.1M12 17.3v.1" />,
  blue: (
    <>
      <path d="M12 19s5-4.6 5-8.6a5 5 0 0 0-10 0c0 4 5 8.6 5 8.6z" />
      <circle cx="12" cy="10.3" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  pending: (
    <>
      {dot(7)}
      {dot(12)}
      {dot(17)}
    </>
  ),
  error: <path d="M12 7v6.5M12 16.9v.1" />,
}

/** Status light: a filled disc in the light's colour with its glyph. */
export function Lamp({ kind, size = 24 }: { kind: LampKind; size?: number }) {
  return (
    <span className="lamp-disc" data-light={kind} style={{ width: size, height: size }}>
      <Svg size={size}>{LAMP[kind]}</Svg>
    </span>
  )
}

export function PlaneIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M21.5 12c0 .8-.7 1.4-1.6 1.4h-4.700l-4.300 6.100H8.700l2.200-6.100H6.400l-1.500 2H3l1.100-3.400L3 8.600h1.900l1.500 2h4.500L8.700 4.500h2.200l4.300 6.100h4.700c.9 0 1.600.6 1.600 1.400z" />
    </svg>
  )
}

export const ShareIcon = () => (
  <Svg>
    <path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v5.500A1.500 1.500 0 0 0 6.500 20h11a1.500 1.500 0 0 0 1.500-1.500V13" />
  </Svg>
)

export const DownloadIcon = () => (
  <Svg>
    <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19.500h14" />
  </Svg>
)

export const LinkIcon = () => (
  <Svg>
    <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" />
  </Svg>
)

export const CheckIcon = () => (
  <Svg>
    <path d="m5.500 12.500 4.200 4.200 8.800-9" />
  </Svg>
)

export const CloseIcon = () => (
  <Svg>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
)

export const ArrowIcon = () => (
  <Svg size={16}>
    <path d="M5 12h14m0 0-5-5m5 5-5 5" />
  </Svg>
)

export const ExternalIcon = () => (
  <Svg size={16}>
    <path d="M9 6h9v9M18 6 7 17" />
  </Svg>
)

export const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
)

export const RetryIcon = () => (
  <Svg size={16}>
    <path d="M19.500 12a7.500 7.500 0 1 1-2.400-5.500M19.500 4.500V8H16" />
  </Svg>
)
