import { useEffect, useRef, useState } from 'react'
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { authHeaders } from '../api.js'

const BASE = import.meta.env.VITE_API_BASE || '/api'

export default function ImportAprovacoesEntradasFiscaisModal({ onCancel, onImported }) {
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  function handleFile(f) {
    if (!f) { setFile(null); return }
    if (!/\.xlsx?$/i.test(f.name)) {
      setError('Arquivo inválido: envie um .xlsx')
      setFile(null)
      return
    }
    setError(null); setResult(null); setFile(f)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${BASE}/aprovacoes-entradas-fiscais/import`, { method: 'POST', body: form, headers: authHeaders() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok && !body?.errors) {
        setError(body?.message || body?.error || `HTTP ${res.status}`)
        return
      }
      setResult(body)
      if ((body.inserted + body.updated) > 0) onImported?.()
    } catch (e) {
      setError(e.message || 'Falha ao importar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !submitting) onCancel()
    }}>
      <form className="modal modal-lg" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h2>Importar Excel</h2>
          <p>Carregue um arquivo <code>.xlsx</code> com as 11 colunas da aprovação.
            Campos obrigatórios: <strong>codigoAprovador</strong>,
            <strong> codigoFilial</strong>, <strong>codigoDocumento</strong>.</p>
        </div>

        <div className="modal-body">
          {error && <div className="banner">{error}</div>}

          {!result && (
            <>
              <div className="import-hint">
                <FileSpreadsheet size={16} />
                <span>Não tem o arquivo? </span>
                <a href={`${BASE}/aprovacoes-entradas-fiscais/template.xlsx`} className="link-primary">
                  <Download size={13} /> baixar modelo
                </a>
              </div>

              <label
                className={`file-drop ${file ? 'has-file' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]) }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Upload size={20} />
                {file
                  ? <div>
                      <strong>{file.name}</strong>
                      <small>{(file.size / 1024).toFixed(1)} KB · clique para trocar</small>
                    </div>
                  : <div>
                      <strong>Selecionar arquivo</strong>
                      <small>ou arraste e solte aqui (.xlsx até 100MB, 500.000 linhas)</small>
                    </div>
                }
              </label>
              <div className="import-hint" style={{ marginTop: 10 }}>
                <span>
                  Inserção em blocos de <strong>5.000 registros</strong> por vez.
                  Tudo roda em uma transação única — se der erro, nada é gravado.
                </span>
              </div>
            </>
          )}

          {result && (
            <div className="import-result">
              <div className="result-totals">
                <Stat label="Linhas"    value={(result.totalRows ?? 0).toLocaleString('pt-BR')} />
                <Stat label="Inseridas" value={(result.inserted ?? 0).toLocaleString('pt-BR')} tone="ok" />
                <Stat label="Blocos"    value={result.batches ?? 0} tone="info" />
                <Stat label="Erros"     value={result.errors?.length || 0} tone={result.errors?.length ? 'err' : 'muted'} />
              </div>
              {result.elapsedMs != null && (
                <div className="import-hint" style={{ justifyContent: 'center' }}>
                  <span>
                    Processado em <strong>{(result.elapsedMs / 1000).toFixed(1)}s</strong>
                    {result.batchSize ? ` · blocos de ${result.batchSize.toLocaleString('pt-BR')} registros` : ''}
                  </span>
                </div>
              )}

              {result.errors?.length > 0 && (
                <div className="result-errors">
                  <div className="result-errors-head"><AlertTriangle size={14} /> Detalhes</div>
                  <ul>
                    {result.errors.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        <span className="err-row">Linha {e.row}</span>
                        {e.codigo && <span className="err-code">{e.codigo}</span>}
                        <span>{e.messages?.join(' · ') || e.message}</span>
                      </li>
                    ))}
                    {result.errors.length > 50 && (
                      <li className="err-more">… e mais {result.errors.length - 50} erro(s) omitidos</li>
                    )}
                  </ul>
                </div>
              )}

              {(result.errors?.length ?? 0) === 0 && (
                <div className="result-ok">
                  <CheckCircle2 size={14} /> Import concluído sem erros.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {!result && (
            <>
              <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={!file || submitting}>
                {submitting ? 'Importando…' : 'Importar'}
              </button>
            </>
          )}
          {result && (
            <button type="button" className="btn btn-primary" onClick={onCancel}>Fechar</button>
          )}
        </div>
      </form>
    </div>
  )
}

function Stat({ label, value, tone = 'muted' }) {
  return (
    <div className={`result-stat tone-${tone}`}>
      <span className="value">{value}</span>
      <span className="label">{label}</span>
    </div>
  )
}
