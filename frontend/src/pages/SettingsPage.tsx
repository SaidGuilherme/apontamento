import { useCallback, useEffect, useState } from 'react'
import { api, type RedmineActivity, type RedmineProject, type RedmineUser, type Settings, type TaskType } from '../api'
import { IssuePicker } from '../components/IssuePicker'
import { ErrorNotice, Notice } from '../components/Notice'

export function SettingsPage() {
  const [saved, setSaved] = useState<Settings | null>(null)
  const [form, setForm] = useState<Settings | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [loadError, setLoadError] = useState<unknown>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<unknown>(null)
  const [savedOk, setSavedOk] = useState(false)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<RedmineUser | null>(null)
  const [testError, setTestError] = useState<unknown>(null)

  const [projects, setProjects] = useState<RedmineProject[] | null>(null)
  const [activities, setActivities] = useState<RedmineActivity[] | null>(null)
  const [lookupError, setLookupError] = useState<unknown>(null)
  const [loadingLookups, setLoadingLookups] = useState(false)

  const loadLookups = useCallback(async () => {
    setLoadingLookups(true)
    setLookupError(null)
    try {
      const [p, a] = await Promise.all([api.getRedmineProjects(), api.getRedmineActivities()])
      setProjects(p)
      setActivities(a)
    } catch (e) {
      setLookupError(e)
    } finally {
      setLoadingLookups(false)
    }
  }, [])

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSaved(s)
        setForm(s)
        if (s.redmineUrl && s.hasApiKey) void loadLookups()
      })
      .catch(setLoadError)
  }, [loadLookups])

  if (loadError) return <main className="page"><ErrorNotice error={loadError} /></main>
  if (!form || !saved) return <main className="page"><p className="muted">Carregando configurações…</p></main>

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSavedOk(false)
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  const connectionChanged =
    (form.redmineUrl ?? '') !== (saved.redmineUrl ?? '') ||
    apiKey.trim() !== '' ||
    form.redmineIgnoreSslErrors !== saved.redmineIgnoreSslErrors

  const persist = async (overrides: { clearApiKey?: boolean } = {}) => {
    setSaving(true)
    setSaveError(null)
    setSavedOk(false)
    try {
      const result = await api.saveSettings({
        redmineUrl: form.redmineUrl,
        redmineApiKey: apiKey.trim() || null,
        clearApiKey: overrides.clearApiKey ?? false,
        redmineIgnoreSslErrors: form.redmineIgnoreSslErrors,
        defaultProjectName: form.defaultProjectName,
        defaultRedmineProjectId: form.defaultRedmineProjectId,
        defaultRedmineProjectName: form.defaultRedmineProjectName,
        defaultIssueId: form.defaultIssueId,
        defaultIssueSubject: form.defaultIssueSubject,
        defaultActivityId: form.defaultActivityId,
        defaultActivityName: form.defaultActivityName,
      })
      const reloadLookups = connectionChanged || overrides.clearApiKey
      setSaved(result)
      setForm(result)
      setApiKey('')
      setSavedOk(true)
      if (reloadLookups) {
        setProjects(null)
        setActivities(null)
        if (result.redmineUrl && result.hasApiKey) void loadLookups()
      }
    } catch (e) {
      setSaveError(e)
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestError(null)
    setTestResult(null)
    try {
      setTestResult(
        await api.testRedmine({
          redmineUrl: form.redmineUrl,
          redmineApiKey: apiKey.trim() || null,
          redmineIgnoreSslErrors: form.redmineIgnoreSslErrors,
        }),
      )
    } catch (e) {
      setTestError(e)
    } finally {
      setTesting(false)
    }
  }

  const lookupsReady = saved.redmineUrl && saved.hasApiKey

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
          <p className="sub">Acesso ao Redmine, valores padrão e a lista de tipos de tarefa.</p>
        </div>
      </div>

      <form
        className="section"
        onSubmit={(e) => {
          e.preventDefault()
          void persist()
        }}
      >
        <section className="panel panel-body section" aria-labelledby="redmine-title">
          <h2 id="redmine-title">Redmine</h2>
          <div className="form-grid">
            <label className="field">
              <span>URL do Redmine</span>
              <input
                className="input"
                type="url"
                placeholder="https://redmine.suaempresa.com.br"
                value={form.redmineUrl ?? ''}
                onChange={(e) => set('redmineUrl', e.target.value || null)}
              />
              <span className="hint">O endereço que você abre no navegador, sem /issues no final.</span>
            </label>
            <label className="field">
              <span>Chave de API</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder={saved.hasApiKey ? 'Chave salva. Digite para trocar.' : 'Cole a chave aqui'}
                value={apiKey}
                onChange={(e) => {
                  setSavedOk(false)
                  setApiKey(e.target.value)
                }}
              />
              <span className="hint">
                No Redmine, abra Minha conta e copie a chave de acesso à API. Ela fica guardada criptografada.
              </span>
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.redmineIgnoreSslErrors}
              onChange={(e) => set('redmineIgnoreSslErrors', e.target.checked)}
            />
            Ignorar erros de certificado (use só se o Redmine interno tiver certificado próprio)
          </label>
          <div className="row">
            <button type="button" className="btn" onClick={test} disabled={testing || !form.redmineUrl}>
              {testing && <span className="spinner" aria-hidden />}
              {testing ? 'Testando…' : 'Testar conexão'}
            </button>
            {saved.hasApiKey && (
              <button type="button" className="btn btn-quiet btn-danger" onClick={() => void persist({ clearApiKey: true })}>
                Remover chave salva
              </button>
            )}
          </div>
          {testResult && (
            <Notice
              tone="ok"
              title={`Conectado como ${testResult.name || testResult.login} (${testResult.login}).`}
              onClose={() => setTestResult(null)}
            >
              {connectionChanged && <span>Salve as configurações para usar esta conexão.</span>}
            </Notice>
          )}
          <ErrorNotice error={testError} onClose={() => setTestError(null)} />
        </section>

        <section className="panel panel-body section" aria-labelledby="defaults-title">
          <div className="section-head">
            <h2 id="defaults-title">Valores padrão</h2>
            {lookupsReady && (
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => void loadLookups()} disabled={loadingLookups}>
                {loadingLookups ? 'Carregando do Redmine…' : 'Recarregar do Redmine'}
              </button>
            )}
          </div>
          {!lookupsReady && (
            <Notice tone="info" title="Salve a URL e a chave do Redmine para escolher o projeto, a issue e a atividade." />
          )}
          <ErrorNotice error={lookupError} />
          <div className="form-grid">
            <label className="field">
              <span>Projeto na planilha</span>
              <input
                className="input"
                value={form.defaultProjectName}
                onChange={(e) => set('defaultProjectName', e.target.value)}
              />
              <span className="hint">Preenche a coluna Projeto de cada nova importação.</span>
            </label>

            <label className="field">
              <span>Projeto do Redmine</span>
              <select
                className="select"
                disabled={!projects}
                value={form.defaultRedmineProjectId ?? ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null
                  const p = projects?.find((x) => x.id === id)
                  set('defaultRedmineProjectId', id)
                  set('defaultRedmineProjectName', p ? p.name : null)
                }}
              >
                <option value="">{projects ? 'Todos os projetos' : (form.defaultRedmineProjectName ?? 'Nenhum')}</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.parentName ? `${p.parentName} / ${p.name}` : p.name}
                  </option>
                ))}
              </select>
              <span className="hint">Limita a busca de issues a este projeto.</span>
            </label>

            <div className="field">
              <span>Issue padrão</span>
              <IssuePicker
                issueId={form.defaultIssueId}
                subject={form.defaultIssueSubject}
                projectId={form.defaultRedmineProjectId}
                disabled={!lookupsReady}
                onChange={(issueId, subject) => {
                  set('defaultIssueId', issueId)
                  set('defaultIssueSubject', subject)
                }}
              />
              <span className="hint">Recebe as horas de todas as linhas, a não ser que a importação ou a linha indique outra.</span>
            </div>

            <label className="field">
              <span>Atividade</span>
              <select
                className="select"
                disabled={!activities}
                value={form.defaultActivityId ?? ''}
                onChange={(e) => {
                  const id = e.target.value ? Number(e.target.value) : null
                  const a = activities?.find((x) => x.id === id)
                  set('defaultActivityId', id)
                  set('defaultActivityName', a ? a.name : null)
                }}
              >
                <option value="">{activities ? 'Escolha a atividade' : (form.defaultActivityName ?? 'Nenhuma')}</option>
                {activities?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.isDefault ? ' (padrão do Redmine)' : ''}
                  </option>
                ))}
              </select>
              <span className="hint">Usada em todos os lançamentos de horas.</span>
            </label>
          </div>
        </section>

        <div className="sticky-actions">
          <span className="muted">
            {savedOk ? 'Configurações salvas.' : 'As alterações acima só valem depois de salvar.'}
          </span>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden />}
            {saving ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </div>
        <ErrorNotice error={saveError} onClose={() => setSaveError(null)} />
      </form>

      <TaskTypesSection />
    </main>
  )
}

function TaskTypesSection() {
  const [types, setTypes] = useState<TaskType[] | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const load = useCallback(() => api.getTaskTypes().then(setTypes).catch(setError), [])

  useEffect(() => {
    void load()
  }, [load])

  const add = async () => {
    const name = newName.trim()
    if (!name) return
    setError(null)
    try {
      await api.createTaskType(name)
      setNewName('')
      await load()
    } catch (e) {
      setError(e)
    }
  }

  const rename = async (t: TaskType, name: string) => {
    if (name.trim() === t.name || !name.trim()) return
    setError(null)
    try {
      await api.updateTaskType(t.id, name.trim())
      await load()
    } catch (e) {
      setError(e)
      await load()
    }
  }

  const move = async (index: number, delta: number) => {
    if (!types) return
    const target = index + delta
    if (target < 0 || target >= types.length) return
    const reordered = [...types]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(target, 0, moved)
    setTypes(reordered)
    try {
      await Promise.all(reordered.map((t, i) => (t.sortOrder === i + 1 ? null : api.updateTaskType(t.id, t.name, i + 1))))
      await load()
    } catch (e) {
      setError(e)
      await load()
    }
  }

  const remove = async (id: number) => {
    setConfirmDelete(null)
    try {
      await api.deleteTaskType(id)
      await load()
    } catch (e) {
      setError(e)
    }
  }

  return (
    <section className="panel panel-body section" aria-labelledby="types-title">
      <div>
        <h2 id="types-title">Tipos de tarefa</h2>
        <p className="muted small" style={{ marginTop: 4 }}>
          Opções da coluna Tipo da tarefa. Renomear ou remover um tipo não altera as linhas já importadas.
        </p>
      </div>
      <ErrorNotice error={error} onClose={() => setError(null)} />
      {types && types.length === 0 && <p className="muted">Nenhum tipo cadastrado ainda.</p>}
      {types && types.length > 0 && (
        <ul className="type-list">
          {types.map((t, i) => (
            <li key={`${t.id}-${t.name}`}>
              <input
                className="input"
                defaultValue={t.name}
                aria-label={`Nome do tipo ${t.name}`}
                onBlur={(e) => void rename(t, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
              <button type="button" className="btn btn-sm" onClick={() => void move(i, -1)} disabled={i === 0} aria-label={`Subir ${t.name}`}>
                ↑
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void move(i, 1)}
                disabled={i === types.length - 1}
                aria-label={`Descer ${t.name}`}
              >
                ↓
              </button>
              {confirmDelete === t.id ? (
                <button
                  type="button"
                  className="btn btn-sm btn-danger confirm"
                  autoFocus
                  onBlur={() => setConfirmDelete(null)}
                  onClick={() => void remove(t.id)}
                >
                  Confirmar
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => setConfirmDelete(t.id)}>
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        style={{ maxWidth: 560 }}
      >
        <label className="field grow">
          <span>Novo tipo</span>
          <input className="input" value={newName} maxLength={100} onChange={(e) => setNewName(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={!newName.trim()}>
          Adicionar
        </button>
      </form>
    </section>
  )
}
