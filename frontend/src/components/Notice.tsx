import type { ReactNode } from 'react'
import { ApiError } from '../api'

type Tone = 'error' | 'ok' | 'attention' | 'info'

interface Props {
  tone: Tone
  title: ReactNode
  details?: string[]
  children?: ReactNode
  onClose?: () => void
}

export function Notice({ tone, title, details, children, onClose }: Props) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="notice-head">
        <span>{title}</span>
        {onClose && (
          <button type="button" className="notice-close" onClick={onClose} aria-label="Fechar aviso">
            ✕
          </button>
        )}
      </div>
      {details && details.length > 0 && (
        <ul className="small">
          {details.slice(0, 20).map((d, i) => (
            <li key={i}>{d}</li>
          ))}
          {details.length > 20 && <li>e mais {details.length - 20}.</li>}
        </ul>
      )}
      {children}
    </div>
  )
}

/** Mostra um erro da API (com os detalhes que o backend mandou). */
export function ErrorNotice({ error, onClose }: { error: unknown; onClose?: () => void }) {
  if (!error) return null
  const message = error instanceof Error ? error.message : String(error)
  const details = error instanceof ApiError ? error.details : undefined
  return <Notice tone="error" title={message} details={details} onClose={onClose} />
}
