import type { ReactNode } from 'react'

interface Props {
  eyebrow: string
  title: string
  lead?: string
  children?: ReactNode
}

/** The sea-coloured title band that opens every sub page. */
export function PageBand({ eyebrow, title, lead, children }: Props) {
  return (
    <header className="band">
      <div className="wrap">
        <p className="label">{eyebrow}</p>
        <h1>{title}</h1>
        {lead && <p className="band-lead">{lead}</p>}
        {children}
      </div>
    </header>
  )
}
