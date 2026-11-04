import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ImportItem, TaskType } from '../api'
import { fromDateTimeInput, plural, toDateTimeInput } from '../format'
import { needsHours } from '../items'
import { HoursInput } from './HoursInput'

interface Props {
  items: ImportItem[]
  taskTypes: TaskType[]
  onChangeItem: (id: number, patch: Partial<ImportItem>) => void
  onApplyToAll: (patch: Partial<ImportItem>) => void
  onRemoveItem: (id: number) => void
}

/** Tabela editável com as colunas que vão para o xlsx. */
export function DataTab({ items, taskTypes, onChangeItem, onApplyToAll, onRemoveItem }: Props) {
  const [bulkProject, setBulkProject] = useState(items[0]?.project ?? '')
  const [bulkTaskType, setBulkTaskType] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)

  const missing = items.filter(needsHours)
  const typeNames = taskTypes.map((t) => t.name)

  const focusFirstMissing = () => {
    if (!missing[0]) return
    const el = document.getElementById(`hours-${missing[0].id}`)?.querySelector('input')
    el?.focus()
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <div className="section">
      <div className="toolbar">
        <div className="toolbar-group">
          <label className="field">
            <span>Projeto em todas as linhas</span>
            <input className="input" style={{ width: 240 }} value={bulkProject} onChange={(e) => setBulkProject(e.target.value)} />
          </label>
          <button type="button" className="btn" onClick={() => onApplyToAll({ project: bulkProject.trim() })} disabled={!bulkProject.trim()}>
            Aplicar
          </button>
        </div>
        <div className="toolbar-group">
          <label className="field">
            <span>Tipo da tarefa em todas as linhas</span>
            <select className="select" style={{ width: 220 }} value={bulkTaskType} onChange={(e) => setBulkTaskType(e.target.value)}>
              <option value="">Escolha um tipo</option>
              {typeNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => onApplyToAll({ taskType: bulkTaskType })} disabled={!bulkTaskType}>
            Aplicar
          </button>
        </div>
      </div>

      {taskTypes.length === 0 && (
        <p className="small muted">
          A lista de tipos de tarefa está vazia. Cadastre os tipos em <Link to="/configuracoes">Configurações</Link>.
        </p>
      )}

      {missing.length > 0 && (
        <div className="notice notice-attention">
          <div className="notice-head">
            <span>
              {plural(missing.length, 'linha está', 'linhas estão')} sem Completed Work. Preencha as horas marcadas para gerar o
              xlsx.
            </span>
            <button type="button" className="btn btn-sm" onClick={focusFirstMissing}>
              Ir para a primeira
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="right">Linha</th>
              <th className="col-project">Projeto</th>
              <th className="col-id">ID</th>
              <th className="col-type">Work Item Type</th>
              <th className="col-tasktype">Tipo da tarefa</th>
              <th className="col-title">Title</th>
              <th className="col-hours right">Completed Work</th>
              <th className="col-assigned">Assigned To</th>
              <th className="col-state">State</th>
              <th className="col-closed">Closed Date</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const sent = item.redmineStatus === 'Sent'
              const unknownType = item.taskType && !typeNames.includes(item.taskType)
              return (
                <tr key={item.id} className={needsHours(item) ? 'needs-hours' : sent ? 'locked' : undefined}>
                  <td className="row-num num">{item.rowNumber}</td>
                  <td>
                    <input
                      className="cell"
                      aria-label={`Projeto da linha ${item.rowNumber}`}
                      value={item.project}
                      onChange={(e) => onChangeItem(item.id, { project: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell num"
                      inputMode="numeric"
                      aria-label={`ID da linha ${item.rowNumber}`}
                      value={item.workItemId || ''}
                      disabled={sent}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ''))
                        onChangeItem(item.id, { workItemId: Number.isFinite(n) ? n : 0 })
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="cell"
                      aria-label={`Work Item Type da linha ${item.rowNumber}`}
                      value={item.workItemType}
                      onChange={(e) => onChangeItem(item.id, { workItemType: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="cell"
                      aria-label={`Tipo da tarefa da linha ${item.rowNumber}`}
                      value={item.taskType ?? ''}
                      onChange={(e) => onChangeItem(item.id, { taskType: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {unknownType && <option value={item.taskType!}>{item.taskType} (removido da lista)</option>}
                      {typeNames.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="cell"
                      aria-label={`Title da linha ${item.rowNumber}`}
                      value={item.title}
                      title={item.title}
                      disabled={sent}
                      onChange={(e) => onChangeItem(item.id, { title: e.target.value })}
                    />
                  </td>
                  <td className="hours-cell" id={`hours-${item.id}`}>
                    <HoursInput
                      label={`Completed Work da linha ${item.rowNumber}`}
                      value={item.completedWork}
                      disabled={sent}
                      onChange={(v) => onChangeItem(item.id, { completedWork: v })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell"
                      aria-label={`Assigned To da linha ${item.rowNumber}`}
                      value={item.assignedTo}
                      title={item.assignedTo}
                      onChange={(e) => onChangeItem(item.id, { assignedTo: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell"
                      aria-label={`State da linha ${item.rowNumber}`}
                      value={item.state}
                      onChange={(e) => onChangeItem(item.id, { state: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="cell num"
                      type="datetime-local"
                      step={1}
                      aria-label={`Closed Date da linha ${item.rowNumber}`}
                      value={toDateTimeInput(item.closedDate)}
                      onChange={(e) => onChangeItem(item.id, { closedDate: fromDateTimeInput(e.target.value) })}
                    />
                  </td>
                  <td>
                    {sent ? (
                      <span className="small faint" title="Já lançada no Redmine">
                        Lançada
                      </span>
                    ) : confirmRemove === item.id ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger confirm"
                        onClick={() => {
                          setConfirmRemove(null)
                          onRemoveItem(item.id)
                        }}
                        onBlur={() => setConfirmRemove(null)}
                        autoFocus
                      >
                        Confirmar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-quiet btn-danger"
                        onClick={() => setConfirmRemove(item.id)}
                        aria-label={`Remover linha ${item.rowNumber}`}
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
