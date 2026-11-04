import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ImportData, type ImportItem, type PreviewStatus, type RedminePreview, type SendResult } from '../api'
import { formatDate, formatHours, formatInstant, plural } from '../format'
import { IssuePicker } from './IssuePicker'
import { ErrorNotice, Notice } from './Notice'

interface Props {
  data: ImportData
  dirty: boolean
  /** Muda a cada salvamento concluído. */
  savedVersion: number
  defaultRedmineProjectId: number | null
  onChangeItem: (id: number, patch: Partial<ImportItem>) => void
  onChangeImportIssue: (issueId: number | null, subject: string | null) => void
  /** Salva na hora as edições pendentes. Devolve false se não conseguiu. */
  save: () => Promise<boolean>
  /** Recarrega a importação depois do envio (os status mudaram). */
  onSent: () => Promise<void>
}

const statusLabel: Record<PreviewStatus, string> = {
  Ready: 'Pronto',
  Sent: 'Lançado',
  Error: 'Falhou',
  Duplicate: 'Já lançado',
  Incomplete: 'Incompleto',
}

export function RedmineTab({ data, dirty, savedVersion, defaultRedmineProjectId, onChangeItem, onChangeImportIssue, save, onSent }: Props) {
  const [preview, setPreview] = useState<RedminePreview | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [sendError, setSendError] = useState<unknown>(null)

  const applyPreview = useCallback((p: RedminePreview) => {
    setPreview(p)
    setSelected(new Set(p.items.filter((i) => i.canSend).map((i) => i.itemId)))
    setConfirming(false)
  }, [])

  const load = useCallback(async () => {
    try {
      setLoadError(null)
      applyPreview(await api.getRedminePreview(data.id))
    } catch (e) {
      setLoadError(e)
    }
  }, [data.id, applyPreview])

  // O salvamento automático fica na página; aqui só recalculamos a prévia depois de cada salvamento.
  useEffect(() => {
    if (!dirty) void load()
  }, [dirty, savedVersion, load])

  const itemsById = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items])

  if (loadError && !preview) return <ErrorNotice error={loadError} />
  if (!preview) return <p className="muted">Montando a prévia dos lançamentos…</p>

  const selectable = preview.items.filter((i) => i.canSend)
  const chosen = selectable.filter((i) => selected.has(i.itemId))
  const chosenHours = chosen.reduce((s, i) => s + (i.hours ?? 0), 0)
  const allChosen = selectable.length > 0 && chosen.length === selectable.length

  const toggle = (id: number) => {
    setConfirming(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const send = async () => {
    setSending(true)
    setSendError(null)
    setResult(null)
    try {
      if (dirty && !(await save())) return
      const res = await api.sendToRedmine(data.id, chosen.map((i) => i.itemId))
      setResult(res)
      applyPreview(res.preview)
      await onSent()
    } catch (e) {
      setSendError(e)
      await load()
    } finally {
      setSending(false)
      setConfirming(false)
    }
  }

  const sentCount = preview.items.filter((i) => i.status === 'Sent').length

  return (
    <div className="section">
      {preview.globalProblems.length > 0 && (
        <Notice tone="attention" title="Falta configurar o Redmine antes de enviar." details={preview.globalProblems}>
          <span>
            <Link to="/configuracoes">Abrir configurações</Link>
          </span>
        </Notice>
      )}

      <div className="panel panel-body">
        <div className="form-grid">
          <div className="field">
            <span>Issue padrão desta importação</span>
            <IssuePicker
              issueId={data.issueId}
              subject={data.issueSubject}
              projectId={defaultRedmineProjectId}
              onChange={onChangeImportIssue}
            />
            <span className="hint">
              Vale para todas as linhas sem issue própria.
              {data.issueId === null && preview.defaultIssueId === null && ' Nenhuma issue padrão nas configurações.'}
            </span>
          </div>
          <div className="field">
            <span>Atividade</span>
            <p>{preview.activityName ?? <span className="faint">não definida</span>}</p>
            <span className="hint">Definida nas configurações e usada em todos os lançamentos.</span>
          </div>
          <div className="field">
            <span>Redmine</span>
            <p style={{ overflowWrap: 'anywhere' }}>{preview.redmineUrl ?? <span className="faint">não configurado</span>}</p>
            <span className="hint">
              {plural(sentCount, 'lançamento já enviado', 'lançamentos já enviados')} de {preview.items.length}.
            </span>
          </div>
        </div>
      </div>

      {result && (
        <Notice
          tone={result.failed > 0 ? 'error' : 'ok'}
          title={
            result.failed > 0
              ? `${plural(result.sent, 'lançamento criado', 'lançamentos criados')}, ${plural(result.failed, 'falhou', 'falharam')}. Veja o motivo em cada linha.`
              : `${plural(result.sent, 'lançamento criado', 'lançamentos criados')} no Redmine.`
          }
          onClose={() => setResult(null)}
        />
      )}
      <ErrorNotice error={sendError} onClose={() => setSendError(null)} />

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Selecionar todos os prontos"
                  checked={allChosen}
                  disabled={selectable.length === 0}
                  onChange={() => {
                    setConfirming(false)
                    setSelected(allChosen ? new Set() : new Set(selectable.map((i) => i.itemId)))
                  }}
                />
              </th>
              <th>Situação</th>
              <th style={{ width: 160 }}>Data</th>
              <th className="right" style={{ width: 80 }}>
                Horas
              </th>
              <th style={{ width: 130 }}>Issue</th>
              <th style={{ minWidth: 320 }}>Comentário</th>
              <th className="right">ID Azure</th>
            </tr>
          </thead>
          <tbody>
            {preview.items.map((p) => {
              const item = itemsById.get(p.itemId)
              const locked = p.status === 'Sent'
              return (
                <tr key={p.itemId} className={locked ? 'locked' : undefined}>
                  <td style={{ paddingInline: 10 }}>
                    <input
                      type="checkbox"
                      aria-label={`Enviar linha ${p.rowNumber}`}
                      checked={selected.has(p.itemId)}
                      disabled={!p.canSend}
                      onChange={() => toggle(p.itemId)}
                    />
                  </td>
                  <td style={{ paddingInline: 8, minWidth: 180 }}>
                    <span className={`status status-${p.status}`}>{statusLabel[p.status]}</span>
                    {p.status === 'Sent' && p.timeEntryId && (
                      <ul className="problems">
                        <li>Lançamento #{p.timeEntryId}</li>
                        {item?.redmineSentAt && <li>{formatInstant(item.redmineSentAt)}</li>}
                      </ul>
                    )}
                    {p.problems.length > 0 && (
                      <ul className="problems">
                        {p.problems.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    )}
                    {p.status === 'Error' && p.error && <p className="error-text">{p.error}</p>}
                  </td>
                  <td>
                    {locked ? (
                      <span className="num" style={{ paddingInline: 6 }}>
                        {formatDate(p.spentOn)}
                      </span>
                    ) : (
                      <input
                        className="cell num"
                        type="date"
                        aria-label={`Data do lançamento da linha ${p.rowNumber}`}
                        value={item?.spentOn ?? ''}
                        onChange={(e) => onChangeItem(p.itemId, { spentOn: e.target.value || null })}
                      />
                    )}
                  </td>
                  <td className="right num" style={{ paddingInline: 10 }}>
                    {p.hours ? formatHours(p.hours) : <span className="faint">—</span>}
                  </td>
                  <td>
                    {locked ? (
                      <span className="num" style={{ paddingInline: 6 }}>
                        #{p.issueId}
                      </span>
                    ) : (
                      <input
                        className="cell num"
                        inputMode="numeric"
                        aria-label={`Issue da linha ${p.rowNumber}`}
                        placeholder={p.issueId && !p.issueIsOverride ? `#${p.issueId} padrão` : 'Nº'}
                        value={item?.redmineIssueId ?? ''}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '')
                          onChangeItem(p.itemId, { redmineIssueId: digits ? Number(digits) : null })
                        }}
                      />
                    )}
                  </td>
                  <td style={{ paddingInline: 10 }}>{p.comment}</td>
                  <td className="right num faint" style={{ paddingInline: 10 }}>
                    {p.workItemId}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky-actions">
        <span className="muted">
          {chosen.length > 0
            ? `${plural(chosen.length, 'lançamento selecionado', 'lançamentos selecionados')}, ${formatHours(chosenHours)} h.`
            : selectable.length === 0
              ? 'Nenhum lançamento pronto para enviar.'
              : 'Selecione os lançamentos que quer criar.'}
          {dirty && ' Salvando alterações…'}
        </span>
        <div className="toolbar-group">
          {confirming ? (
            <>
              <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={sending}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={send} disabled={sending}>
                {sending && <span className="spinner" aria-hidden />}
                {sending ? 'Criando lançamentos…' : `Confirmar: criar ${chosen.length} no Redmine`}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={chosen.length === 0 || sending}
              onClick={() => setConfirming(true)}
            >
              Criar {plural(chosen.length, 'lançamento', 'lançamentos')} no Redmine
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
