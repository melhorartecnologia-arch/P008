import { useEffect, useState, useCallback } from 'react'
import { X as XIcon, MessageSquarePlus, MessageSquare, Trash2, Send, CalendarDays, Loader2 } from 'lucide-react'
import { apiGet, apiSend } from '../api.js'
import { FIELDS, formatValue } from '../pages/entradasFiscaisFields.js'

const BASE = import.meta.env.VITE_API_BASE || '/api'

const fmtDayLong = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
const fmtDateTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return iso
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(d)
}

function buildQuery({ range, codigoFilial, filter, grupoProdutoId }) {
  const parts = []
  if (range?.from) parts.push(`from=${encodeURIComponent(range.from)}`)
  if (range?.to)   parts.push(`to=${encodeURIComponent(range.to)}`)
  if (codigoFilial) parts.push(`codigoFilial=${encodeURIComponent(codigoFilial)}`)
  if (grupoProdutoId !== undefined && grupoProdutoId !== null) {
    parts.push(`grupoProdutoId=${encodeURIComponent(grupoProdutoId)}`)
  } else if (grupoProdutoId === null) {
    // cliente pode passar null explicitamente para "Sem grupo"
    parts.push(`grupoProdutoId=null`)
  }
  if (filter?.op === 'lt' || filter?.op === 'gt') {
    parts.push(`op=${filter.op}`)
    if (typeof filter.maxPercent === 'number' && filter.maxPercent > 0) {
      parts.push(`maxPercent=${filter.maxPercent}`)
    }
    if (typeof filter.minPercent === 'number' && filter.minPercent > 0) {
      parts.push(`minPercent=${filter.minPercent}`)
    }
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export default function DayDetailsModal({ range, codigoFilial, filter, grupoProdutoId, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [justs, setJusts] = useState([])
  const [justLoading, setJustLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const singleDay = range?.from && range?.from === range?.to
  const headerLabel = singleDay
    ? fmtDayLong(range.from)
    : range?.from && range?.to
      ? `${fmtDayLong(range.from)} — ${fmtDayLong(range.to)}`
      : 'Todos os períodos'

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const qs = buildQuery({ range, codigoFilial, filter, grupoProdutoId })
      const data = await apiGet(`/entradas-fiscais/items${qs}`)
      setItems(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [range?.from, range?.to, codigoFilial, filter, grupoProdutoId])

  useEffect(() => { loadItems() }, [loadItems])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function loadJusts(id) {
    setJustLoading(true)
    try {
      const data = await apiGet(`/entradas-fiscais/${id}/justificativas`)
      setJusts(Array.isArray(data) ? data : [])
    } catch {
      setJusts([])
    } finally {
      setJustLoading(false)
    }
  }

  function selectRow(id) {
    if (selectedId === id) return
    setSelectedId(id)
    setNewComment('')
    setJusts([])
    loadJusts(id)
  }

  async function handleAddComment(e) {
    e.preventDefault()
    if (!selectedId || !newComment.trim()) return
    setSubmitting(true)
    try {
      await apiSend('POST', `/entradas-fiscais/${selectedId}/justificativas`, {
        comentario: newComment.trim(),
        autor: newAuthor.trim() || null
      })
      setNewComment('')
      await loadJusts(selectedId)
      // Atualiza contagem na tabela
      setItems((prev) => prev.map((it) =>
        it.id === selectedId
          ? { ...it, justificativasCount: (it.justificativasCount || 0) + 1 }
          : it
      ))
    } catch (e) {
      setError(e.message || 'Falha ao adicionar justificativa')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteComment(justId) {
    if (!selectedId) return
    if (!confirm('Remover esta justificativa?')) return
    try {
      await apiSend('DELETE', `/entradas-fiscais/${selectedId}/justificativas/${justId}`)
      await loadJusts(selectedId)
      setItems((prev) => prev.map((it) =>
        it.id === selectedId
          ? { ...it, justificativasCount: Math.max(0, (it.justificativasCount || 0) - 1) }
          : it
      ))
    } catch (e) {
      setError(e.message || 'Falha ao remover')
    }
  }

  const selected = items.find((i) => i.id === selectedId) || null

  return (
    <div
      className="modal-backdrop chart-modal"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal modal-chart details-modal" role="dialog" aria-modal="true">
        <div className="modal-head chart-modal-head">
          <div>
            <h2>
              <CalendarDays size={16} style={{ verticalAlign: '-2px' }} />{' '}
              {filter?.label
                ? <><span style={{ color: filter.color }}>{filter.label}</span> · {headerLabel}</>
                : <>Detalhes de {headerLabel}</>}
            </h2>
            <p>
              {loading ? 'Carregando…' : `${items.length} documento${items.length === 1 ? '' : 's'} fiscal(is)`}
              {filter?.label && <> · filtro: <strong>{filter.label}</strong></>}
              {codigoFilial && <> · filial: <strong>{codigoFilial}</strong></>}
            </p>
          </div>
          <div className="chart-modal-actions">
            <button
              className="card-arrow"
              aria-label="Fechar"
              title="Fechar (Esc)"
              onClick={onClose}
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body details-body">
          {error && <div className="banner" style={{ margin: '10px 20px' }}>{error}</div>}

          <div className="details-grid">
            <div className="details-table-wrap">
              <table className="crud-table wide-table">
                <thead>
                  <tr>
                    <th className="col-id">ID</th>
                    {FIELDS.map((f) => (
                      <th key={f.name} style={{
                        minWidth: f.w,
                        textAlign: f.align === 'right' ? 'right' : 'left'
                      }}>{f.label}</th>
                    ))}
                    <th style={{ minWidth: 100, textAlign: 'center' }}>Justif.</th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={FIELDS.length + 2}>
                        <div className="empty-state">Nenhum documento fiscal para este dia com os filtros aplicados.</div>
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className={`details-row ${selectedId === it.id ? 'selected' : ''}`}
                      onClick={() => selectRow(it.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="col-id">#{it.id}</td>
                      {FIELDS.map((f) => (
                        <td key={f.name} style={{
                          textAlign: f.align === 'right' ? 'right' : 'left',
                          fontVariantNumeric: f.kind === 'numeric' ? 'tabular-nums' : 'normal'
                        }}>
                          {formatValue(f, it[f.name])}
                        </td>
                      ))}
                      <td style={{ textAlign: 'center' }}>
                        <span className={`just-badge ${it.justificativasCount > 0 ? 'has' : 'empty'}`}>
                          <MessageSquare size={12} />
                          {it.justificativasCount || 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className={`details-side ${selected ? 'active' : ''}`}>
              {!selected ? (
                <div className="details-side-empty">
                  <MessageSquarePlus size={24} />
                  <p>Clique em uma linha para visualizar e adicionar justificativas.</p>
                </div>
              ) : (
                <>
                  <div className="details-side-head">
                    <div>
                      <div className="details-side-label">Registro #{selected.id}</div>
                      <h3>
                        {selected.codigoProduto}
                        {selected.descricaoProduto ? ` · ${selected.descricaoProduto}` : ''}
                      </h3>
                      <div className="details-side-meta">
                        NF {selected.numeroDocumentoFiscal}/{selected.serieDocumentoFiscal || '—'} ·
                        item {selected.itemDocumentoFiscal} · filial {selected.codigoFilial}
                      </div>
                    </div>
                  </div>

                  <div className="details-divergence">
                    <div className="details-divergence-row">
                      <span>Valor NF</span>
                      <strong>{formatValue({ kind: 'numeric', money: true }, selected.valorNotaFiscal)}</strong>
                    </div>
                    <div className="details-divergence-row">
                      <span>Valor negociado</span>
                      <strong>{formatValue({ kind: 'numeric', money: true }, selected.valorNegociadoCompras)}</strong>
                    </div>
                    <div className="details-divergence-row">
                      <span>Qtd escriturada</span>
                      <strong>{formatValue({ kind: 'numeric' }, selected.quantidadeEscriturada)}</strong>
                    </div>
                  </div>

                  <form className="just-form" onSubmit={handleAddComment}>
                    <label htmlFor="just-author">Autor (opcional)</label>
                    <input
                      id="just-author"
                      type="text"
                      maxLength={120}
                      value={newAuthor}
                      onChange={(e) => setNewAuthor(e.target.value)}
                      placeholder="Seu nome"
                      autoComplete="off"
                    />
                    <label htmlFor="just-text">Justificativa</label>
                    <textarea
                      id="just-text"
                      maxLength={2000}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      rows={3}
                      placeholder="Escreva o motivo ou observação sobre essa divergência…"
                      required
                    />
                    <div className="just-form-foot">
                      <span className="hint-counter">{newComment.length}/2000</span>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={!newComment.trim() || submitting}
                      >
                        {submitting ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                        <span>{submitting ? 'Enviando…' : 'Adicionar'}</span>
                      </button>
                    </div>
                  </form>

                  <div className="just-list">
                    <div className="just-list-head">
                      Justificativas ({justs.length})
                      {justLoading && <Loader2 size={12} className="spin" />}
                    </div>
                    {!justLoading && justs.length === 0 && (
                      <div className="just-empty">Nenhuma justificativa registrada ainda.</div>
                    )}
                    {justs.map((j) => (
                      <div key={j.id} className="just-item">
                        <div className="just-item-head">
                          <strong>{j.autor || 'Anônimo'}</strong>
                          <span>{fmtDateTime(j.createdAt)}</span>
                          <button
                            type="button"
                            className="row-action danger"
                            title="Remover"
                            onClick={() => handleDeleteComment(j.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="just-item-body">{j.comentario}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
