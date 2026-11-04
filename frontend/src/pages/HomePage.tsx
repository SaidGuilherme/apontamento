import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type ImportSummary } from '../api'
import { ErrorNotice } from '../components/Notice'
import { formatHours, formatInstant } from '../format'

export function HomePage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [imports, setImports] = useState<ImportSummary[] | null>(null)
  const [listError, setListError] = useState<unknown>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const loadList = () =>
    api
      .listImports()
      .then((l) => {
        setImports(l)
        setListError(null)
      })
      .catch(setListError)

  useEffect(() => {
    void loadList()
  }, [])

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (!/\.csv$/i.test(file.name)) {
      setError(new Error('Escolha um arquivo .csv exportado do Azure DevOps.'))
      return
    }
    setUploading(true)
    setError(null)
    try {
      const created = await api.uploadCsv(file)
      navigate(`/importacoes/${created.id}`)
    } catch (e) {
      setError(e)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (id: number) => {
    setConfirmDelete(null)
    try {
      await api.deleteImport(id)
      await loadList()
    } catch (e) {
      setListError(e)
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Apontamento de horas</h1>
          <p className="sub">Importe o CSV do Azure DevOps, revise as horas, gere a planilha e lance no Redmine.</p>
        </div>
      </div>

      <section className="section" aria-labelledby="upload-title">
        <h2 id="upload-title" className="sr-only">
          Nova importação
        </h2>
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            void upload(e.dataTransfer.files[0])
          }}
        >
          <strong>Arraste o CSV para cá</strong>
          <p className="muted small">
            Colunas esperadas: ID, Work Item Type, Title, Completed Work, Assigned To, State e Closed Date.
          </p>
          <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading && <span className="spinner" aria-hidden />}
            {uploading ? 'Importando…' : 'Escolher arquivo'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </div>
        <ErrorNotice error={error} onClose={() => setError(null)} />
      </section>

      <section className="section" aria-labelledby="history-title">
        <div className="section-head">
          <h2 id="history-title">Importações anteriores</h2>
        </div>
        <ErrorNotice error={listError} />
        {imports && imports.length === 0 && (
          <div className="panel empty">Nenhuma importação ainda. A primeira aparece aqui assim que você enviar um CSV.</div>
        )}
        {imports && imports.length > 0 && (
          <div className="table-wrap">
            <table className="list-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Importado em</th>
                  <th className="right">Linhas</th>
                  <th className="right">Horas</th>
                  <th className="right">Sem horas</th>
                  <th className="right">No Redmine</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={`/importacoes/${i.id}`}>{i.fileName}</Link>
                    </td>
                    <td className="num">{formatInstant(i.createdAt)}</td>
                    <td className="right num">{i.itemCount}</td>
                    <td className="right num">{formatHours(i.totalHours)}</td>
                    <td className="right num">{i.missingHoursCount || <span className="faint">0</span>}</td>
                    <td className="right num">
                      {i.sentCount}/{i.itemCount}
                      {i.errorCount > 0 && <span className="error-text"> ({i.errorCount} com erro)</span>}
                    </td>
                    <td className="right">
                      {confirmDelete === i.id ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger confirm"
                          autoFocus
                          onBlur={() => setConfirmDelete(null)}
                          onClick={() => remove(i.id)}
                        >
                          Confirmar exclusão
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm btn-quiet btn-danger" onClick={() => setConfirmDelete(i.id)}>
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {imports && imports.some((i) => i.sentCount > 0) && (
          <p className="small faint">Excluir uma importação não apaga os lançamentos que já estão no Redmine, mas a aplicação deixa de saber que eles foram enviados.</p>
        )}
      </section>
    </main>
  )
}
