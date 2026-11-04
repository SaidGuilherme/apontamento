import { useEffect, useRef, useState } from 'react'
import { api, type RedmineIssue } from '../api'

interface Props {
  issueId: number | null
  subject: string | null
  /** Projeto do Redmine usado na busca. Sem projeto, busca em todos os que a chave enxerga. */
  projectId: number | null
  onChange: (issueId: number | null, subject: string | null) => void
  disabled?: boolean
  id?: string
}

/** Escolhe uma issue do Redmine digitando o número ou procurando pelo assunto. */
export function IssuePicker({ issueId, subject, projectId, onChange, disabled, id }: Props) {
  const [text, setText] = useState(issueId ? String(issueId) : '')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setText(issueId ? String(issueId) : '')
  }, [issueId])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const commitText = async () => {
    const trimmed = text.trim().replace(/^#/, '')
    if (!trimmed) {
      setLookupError(null)
      if (issueId !== null) onChange(null, null)
      return
    }
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n <= 0) {
      setLookupError('Digite só o número da issue.')
      return
    }
    if (n === issueId && subject) return

    setChecking(true)
    setLookupError(null)
    try {
      const issue = await api.getRedmineIssue(n)
      onChange(issue.id, issue.subject)
    } catch (e) {
      // Guarda o número mesmo sem confirmar, para não travar quem está sem VPN no momento.
      onChange(n, null)
      setLookupError(e instanceof Error ? e.message : 'Não consegui confirmar a issue.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="issue-picker" ref={rootRef}>
      <div className="controls">
        <input
          id={id}
          className="input id-input num"
          inputMode="numeric"
          placeholder="Nº da issue"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <button type="button" className="btn" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Procurar
        </button>
        {issueId !== null && !disabled && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              setLookupError(null)
              onChange(null, null)
            }}
          >
            Limpar
          </button>
        )}
      </div>
      {checking ? (
        <span className="issue-subject">Conferindo no Redmine…</span>
      ) : lookupError ? (
        <span className="error-text">{lookupError}</span>
      ) : subject ? (
        <span className="issue-subject">{subject}</span>
      ) : null}
      {open && (
        <IssueSearch
          projectId={projectId}
          onPick={(issue) => {
            setOpen(false)
            setLookupError(null)
            onChange(issue.id, issue.subject)
          }}
        />
      )}
    </div>
  )
}

function IssueSearch({ projectId, onPick }: { projectId: number | null; onPick: (issue: RedmineIssue) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<RedmineIssue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const list = await api.searchRedmineIssues(projectId, q)
        if (!cancelled) setResults(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha na busca.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, projectId])

  return (
    <div className="issue-popover" role="dialog" aria-label="Procurar issue no Redmine">
      <input
        className="input"
        autoFocus
        placeholder="Filtrar pelo assunto ou número"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <span className="small faint">
        {projectId ? 'Issues abertas do projeto padrão' : 'Issues abertas de todos os projetos'}, mais recentes primeiro.
      </span>
      {error && <span className="error-text">{error}</span>}
      {loading && !results && <span className="small muted">Buscando…</span>}
      {results && results.length === 0 && <span className="small muted">Nenhuma issue encontrada.</span>}
      {results && results.length > 0 && (
        <ul className="issue-results">
          {results.map((issue) => (
            <li key={issue.id}>
              <button type="button" onClick={() => onPick(issue)}>
                <span className="issue-id">#{issue.id}</span>
                <span>
                  {issue.subject}
                  <br />
                  <span className="small faint">
                    {[issue.projectName, issue.trackerName, issue.statusName].filter(Boolean).join(', ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
