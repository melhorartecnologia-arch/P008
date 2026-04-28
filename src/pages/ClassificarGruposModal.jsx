import { useEffect, useState } from 'react'
import { X as XIcon, Layers, Send, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { authHeaders } from '../api.js'

const BASE = import.meta.env.VITE_API_BASE || '/api'

export default function ClassificarGruposModal({ onClose, onDone }) {
  const [mode, setMode] = useState('unclassified')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  async function handleRun(e) {
    e?.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/entradas-fiscais/classificar-grupos`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ mode })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body?.message || body?.error || `HTTP ${res.status}`)
        return
      }
      setResult(body)
      onDone?.()
    } catch (e) {
      setError(e.message || 'Falha ao classificar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !submitting) onClose()
    }}>
      <form className="modal modal-lg" onSubmit={handleRun}>
        <div className="modal-head">
          <h2><Layers size={16} style={{ verticalAlign: '-2px' }} /> Classificar em grupos de produtos</h2>
          <p>
            Analisa a <code>descricao_produto</code> de cada entrada e vincula o
            melhor grupo cuja <strong>palavra-chave</strong> aparece na descrição.
          </p>
        </div>

        <div className="modal-body">
          {error && <div className="banner">{error}</div>}

          {!result && (
            <>
              <div className="algo-list">
                <div className="algo-card">
                  <span className="algo-badge ok">1</span>
                  <div>
                    <strong>Palavra inteira com peso pela posição</strong>
                    <small>
                      Tokeniza a descrição e procura a palavra-chave como palavra
                      completa (suporta chaves compostas). O índice da primeira
                      palavra casada entra no score — <strong>quanto mais cedo
                      ela aparece, maior o peso</strong>. Descrições que começam
                      com o termo vencem.
                    </small>
                  </div>
                </div>
                <div className="algo-card">
                  <span className="algo-badge soft">2</span>
                  <div>
                    <strong>Substring com peso pela posição</strong>
                    <small>
                      Fallback: se a palavra-chave não casar como palavra inteira,
                      procura como substring e usa a posição do primeiro caractere
                      casado para ponderar. Prevalece sobre não-casar, mas perde
                      para qualquer match do algoritmo 1.
                    </small>
                  </div>
                </div>
                <div className="algo-hint">
                  Desempate: maior comprimento da palavra-chave; depois código do grupo (asc).
                  Comparações sem acento e sem diferenciar maiúsculas.
                </div>
              </div>

              <div className="import-mode">
                <span className="mode-label">Alvo:</span>
                <label>
                  <input
                    type="radio"
                    name="classif-mode"
                    value="unclassified"
                    checked={mode === 'unclassified'}
                    onChange={() => setMode('unclassified')}
                  />
                  <span>Somente entradas ainda sem grupo</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="classif-mode"
                    value="all"
                    checked={mode === 'all'}
                    onChange={() => setMode('all')}
                  />
                  <span>Reclassificar tudo</span>
                </label>
              </div>
            </>
          )}

          {result && (
            <div className="import-result">
              <div className="result-totals">
                <Stat label="Analisadas"  value={fmt(result.scanned)} />
                <Stat label="Vinculadas"  value={fmt(result.updated)}  tone="ok" />
                <Stat label="Sem match"   value={fmt(result.unmatched)} tone={result.unmatched ? 'warn' : 'muted'} />
                <Stat label="Algo 1"      value={fmt(result.algorithms?.word || 0)} tone="info" />
                <Stat label="Algo 2"      value={fmt(result.algorithms?.substring || 0)} tone="info" />
              </div>

              {result.elapsedMs != null && (
                <div className="import-hint" style={{ justifyContent: 'center' }}>
                  <span>Processado em <strong>{(result.elapsedMs / 1000).toFixed(2)}s</strong></span>
                </div>
              )}

              {result.grupos?.length > 0 && (
                <div className="result-errors">
                  <div className="result-errors-head">
                    <Layers size={14} /> Distribuição por grupo
                  </div>
                  <ul>
                    {result.grupos.map((g) => (
                      <li key={g.id}>
                        <span className="err-code">{g.codigo}</span>
                        <span>{g.descricao}</span>
                        <span className="err-row" style={{ marginLeft: 'auto', color: 'var(--text-2)', fontWeight: 600 }}>
                          {fmt(g.count)} itens
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(result.unmatched ?? 0) === 0 && result.updated > 0 && (
                <div className="result-ok">
                  <CheckCircle2 size={14} /> Todos os itens foram vinculados a um grupo.
                </div>
              )}
              {result.updated === 0 && (
                <div className="result-ok" style={{ background: '#fff4e3', color: '#b8700e' }}>
                  <AlertTriangle size={14} /> Nenhum item casou com alguma palavra-chave.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {!result && (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                <span>{submitting ? 'Classificando…' : 'Executar'}</span>
              </button>
            </>
          )}
          {result && (
            <button type="button" className="btn btn-primary" onClick={onClose}>
              <XIcon size={14} /> Fechar
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

const fmt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n || 0))

function Stat({ label, value, tone = 'muted' }) {
  return (
    <div className={`result-stat tone-${tone}`}>
      <span className="value">{value}</span>
      <span className="label">{label}</span>
    </div>
  )
}
