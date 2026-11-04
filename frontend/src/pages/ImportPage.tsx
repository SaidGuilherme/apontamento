import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, type ImportData, type ImportItem, type Settings, type TaskType } from '../api'
import { DataTab } from '../components/DataTab'
import { DayStrip } from '../components/DayStrip'
import { ErrorNotice, Notice } from '../components/Notice'
import { RedmineTab } from '../components/RedmineTab'
import { formatInstant, plural } from '../format'
import { needsHours } from '../items'

type Tab = 'dados' | 'redmine'

export function ImportPage() {
  const id = Number(useParams().id)
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('aba') === 'redmine' ? 'redmine' : 'dados'

  const [data, setData] = useState<ImportData | null>(null)
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [savedVersion, setSavedVersion] = useState(0)

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<unknown>(null)
  const [exportedName, setExportedName] = useState<string | null>(null)

  const dataRef = useRef<ImportData | null>(null)
  const dirtyRef = useRef(false)
  const editCounter = useRef(0)
  const saveChain = useRef<Promise<boolean>>(Promise.resolve(true))

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    let cancelled = false
    Promise.all([api.getImport(id), api.getTaskTypes(), api.getSettings()])
      .then(([imp, types, s]) => {
        if (cancelled) return
        setData(imp)
        setTaskTypes(types)
        setSettings(s)
      })
      .catch((e) => !cancelled && setLoadError(e))
    return () => {
      cancelled = true
    }
  }, [id])

  /** Salva o rascunho atual. As chamadas entram numa fila para nunca rodarem ao mesmo tempo. */
  const save = useCallback((): Promise<boolean> => {
    const run = async () => {
      const snapshot = dataRef.current
      if (!snapshot || !dirtyRef.current) return true
      const editsAtStart = editCounter.current
      setSaving(true)
      try {
        const saved = await api.saveImport(id, snapshot)
        // Só troca o rascunho pelo que veio do servidor se ninguém editou durante o salvamento.
        if (editCounter.current === editsAtStart) {
          dataRef.current = saved
          dirtyRef.current = false
          setData(saved)
          setDirty(false)
        }
        setSaveError(null)
        setSavedVersion((v) => v + 1)
        return true
      } catch (e) {
        setSaveError(e)
        return false
      } finally {
        setSaving(false)
      }
    }
    saveChain.current = saveChain.current.then(run, run)
    return saveChain.current
  }, [id])

  // Salvamento automático pouco depois da última edição.
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => void save(), 800)
    return () => clearTimeout(timer)
  }, [data, dirty, save])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const edit = (fn: (d: ImportData) => ImportData) => {
    editCounter.current++
    dirtyRef.current = true
    setData((d) => {
      if (!d) return d
      const next = fn(d)
      dataRef.current = next
      return next
    })
    setDirty(true)
    setExportedName(null)
  }

  const changeItem = (itemId: number, patch: Partial<ImportItem>) =>
    edit((d) => ({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }))

  const applyToAll = (patch: Partial<ImportItem>) => edit((d) => ({ ...d, items: d.items.map((i) => ({ ...i, ...patch })) }))

  const changeImportIssue = (issueId: number | null, issueSubject: string | null) =>
    edit((d) => ({ ...d, issueId, issueSubject }))

  const removeItem = async (itemId: number) => {
    if (!(await save())) return
    try {
      const updated = await api.deleteImportItem(id, itemId)
      setData(updated)
    } catch (e) {
      setSaveError(e)
    }
  }

  const reloadAfterSend = async () => {
    if (dirtyRef.current) return
    setData(await api.getImport(id))
  }

  const exportXlsx = async () => {
    if (!data) return
    setExporting(true)
    setExportError(null)
    try {
      if (!(await save())) return
      const name = await api.downloadXlsx(id, data.fileName.replace(/\.csv$/i, '') + ' - apontamento.xlsx')
      setExportedName(name)
    } catch (e) {
      setExportError(e)
    } finally {
      setExporting(false)
    }
  }

  const setTab = (t: Tab) => {
    setParams(t === 'redmine' ? { aba: 'redmine' } : {}, { replace: true })
  }

  if (loadError) {
    return (
      <main className="page">
        <ErrorNotice error={loadError} />
        <p>
          <Link to="/">Voltar para as importações</Link>
        </p>
      </main>
    )
  }

  if (!data || !settings) {
    return (
      <main className="page">
        <p className="muted">Carregando importação…</p>
      </main>
    )
  }

  const missing = data.items.filter(needsHours).length
  const sent = data.items.filter((i) => i.redmineStatus === 'Sent').length

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="small">
            <Link to="/">Importações</Link>
          </p>
          <h1 style={{ overflowWrap: 'anywhere' }}>{data.fileName}</h1>
          <p className="sub">
            Importado em {formatInstant(data.createdAt)}, {plural(data.items.length, 'linha', 'linhas')}.{' '}
            <SaveState dirty={dirty} saving={saving} failed={!!saveError} />
          </p>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-primary"
            onClick={exportXlsx}
            disabled={exporting || missing > 0}
            title={missing > 0 ? 'Preencha o Completed Work de todas as linhas' : undefined}
          >
            {exporting && <span className="spinner" aria-hidden />}
            {exporting ? 'Gerando xlsx…' : 'Gerar xlsx'}
          </button>
        </div>
      </div>

      <ErrorNotice error={saveError} onClose={() => setSaveError(null)} />
      <ErrorNotice error={exportError} onClose={() => setExportError(null)} />
      {missing > 0 && tab === 'redmine' && (
        <Notice tone="attention" title={`${plural(missing, 'linha está', 'linhas estão')} sem Completed Work. O xlsx só é gerado depois de preencher.`} />
      )}
      {exportedName && (
        <Notice tone="ok" title={`Planilha gerada: ${exportedName}`} onClose={() => setExportedName(null)}>
          {tab === 'dados' && (
            <span>
              Próximo passo: revise os lançamentos que serão criados no Redmine.{' '}
              <button type="button" className="btn btn-sm" onClick={() => setTab('redmine')}>
                Revisar lançamentos
              </button>
            </span>
          )}
        </Notice>
      )}

      <DayStrip items={data.items} />

      <div className="tabs" role="tablist">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'dados'} onClick={() => setTab('dados')}>
          Dados da planilha <span className="count num">{data.items.length}</span>
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'redmine'} onClick={() => setTab('redmine')}>
          Lançamentos no Redmine{' '}
          <span className="count num">
            {sent}/{data.items.length}
          </span>
        </button>
      </div>

      {tab === 'dados' ? (
        <DataTab
          items={data.items}
          taskTypes={taskTypes}
          onChangeItem={changeItem}
          onApplyToAll={applyToAll}
          onRemoveItem={removeItem}
        />
      ) : (
        <RedmineTab
          data={data}
          dirty={dirty}
          savedVersion={savedVersion}
          defaultRedmineProjectId={settings.defaultRedmineProjectId}
          onChangeItem={changeItem}
          onChangeImportIssue={changeImportIssue}
          save={save}
          onSent={reloadAfterSend}
        />
      )}
    </main>
  )
}

function SaveState({ dirty, saving, failed }: { dirty: boolean; saving: boolean; failed: boolean }) {
  if (saving) return <span className="faint">Salvando…</span>
  if (failed) return <span className="error-text">Alterações não salvas.</span>
  if (dirty) return <span className="faint">Alterações pendentes…</span>
  return <span className="faint">Tudo salvo.</span>
}
