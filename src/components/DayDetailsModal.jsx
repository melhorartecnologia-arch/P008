import { Fragment, useEffect, useRef, useState, useCallback } from 'react'
import { X as XIcon, MessageSquarePlus, MessageSquare, Trash2, Send, CalendarDays, Loader2 } from 'lucide-react'
import { apiGet, apiSend } from '../api.js'
import { FIELDS, formatValue } from '../pages/entradasFiscaisFields.js'

const BASE = import.meta.env.VITE_API_BASE || '/api'

const fmtMoney = (n) => (n != null && n !== '')
  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n))
  : '—'
const fmtQty = (n) => (n != null && n !== '')
  ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(Number(n))
  : '—'

// (preço unitário do pedido − preço unitário da NF) × quantidade escriturada
const computeVariation = (it) => {
  const qtdPed = Number(it.quantidadePedidoCompras)
  const valNeg = Number(it.valorNegociadoCompras)
  const qtdNf  = Number(it.quantidadeEscriturada)
  const valNf  = Number(it.valorNotaFiscal)
  if (!Number.isFinite(qtdPed) || qtdPed === 0) return null
  if (!Number.isFinite(qtdNf)  || qtdNf === 0)  return null
  if (!Number.isFinite(valNeg) || !Number.isFinite(valNf)) return null
  const unitPed = valNeg / qtdPed
  const unitNf  = valNf  / qtdNf
  return (unitPed - unitNf) * qtdNf
}

// Colunas que são fundidas em uma única célula empilhada na tabela
// de detalhes. O `fields[0]` define onde o cluster é renderizado
// (posição original do primeiro campo dentro de FIELDS).
const COMBINED_GROUPS = [
  {
    key: 'documento',
    label: 'Documento',
    minWidth: 160,
    fields: ['codigoFilial', 'numeroDocumentoFiscal', 'serieDocumentoFiscal', 'itemDocumentoFiscal'],
    renderBody: (it) => (
      <>
        <span className="doc-line doc-muted">
          Filial <strong>{it.codigoFilial || '—'}</strong>
        </span>
        <span className="doc-line doc-main">
          NF {it.numeroDocumentoFiscal || '—'} / {it.serieDocumentoFiscal || '—'}
        </span>
        <span className="doc-line doc-muted">
          item {it.itemDocumentoFiscal || '—'}
        </span>
      </>
    )
  },
  {
    key: 'produto',
    label: 'Produto',
    minWidth: 220,
    fields: ['codigoProduto', 'descricaoProduto'],
    renderBody: (it) => (
      <>
        <span className="doc-line doc-muted">{it.codigoProduto || '—'}</span>
        <span className="doc-line doc-main">{it.descricaoProduto || '—'}</span>
      </>
    )
  },
  {
    key: 'pedido',
    label: 'Pedido de Compras',
    minWidth: 160,
    fields: ['numeroPedidoCompras', 'tipoPedidoCompras'],
    renderBody: (it) => (
      <>
        <span className="doc-line doc-main">{it.numeroPedidoCompras || '—'}</span>
        <span className="doc-line doc-muted">{it.tipoPedidoCompras || '—'}</span>
      </>
    )
  },
  {
    key: 'nfFornecedor',
    label: 'NF (fornecedor)',
    minWidth: 140,
    align: 'right',
    fields: ['quantidadeEscriturada', 'valorNotaFiscal'],
    renderBody: (it) => (
      <>
        <span className="doc-line doc-main">{fmtMoney(it.valorNotaFiscal)}</span>
        <span className="doc-line doc-muted">Qtd {fmtQty(it.quantidadeEscriturada)}</span>
      </>
    )
  },
  {
    key: 'negociado',
    label: 'Negociado (compras)',
    minWidth: 140,
    align: 'right',
    fields: ['quantidadePedidoCompras', 'valorNegociadoCompras'],
    renderBody: (it) => (
      <>
        <span className="doc-line doc-main">{fmtMoney(it.valorNegociadoCompras)}</span>
        <span className="doc-line doc-muted">Qtd {fmtQty(it.quantidadePedidoCompras)}</span>
      </>
    )
  }
]

// Colunas calculadas que aparecem logo depois do grupo informado.
const EXTRA_AFTER_GROUP = {
  negociado: [
    {
      key: 'variacaoMonetaria',
      label: 'Variação (R$)',
      minWidth: 130,
      align: 'right',
      render: (it) => {
        const v = computeVariation(it)
        if (v == null) return <span className="doc-line doc-muted">—</span>
        const tone = v > 0 ? 'ok' : v < 0 ? 'bad' : 'neutral'
        return (
          <span className={`doc-line doc-main var-${tone}`}>
            {fmtMoney(v)}
          </span>
        )
      }
    }
  ]
}

// Campos que não aparecem como coluna, mas ficam disponíveis em
// tooltip quando o mouse descansa 2s sobre a linha.
const HIDDEN_FIELDS = new Set([
  'codigoTipoEntrada',
  'descricaoTipoEntrada'
])

const GROUP_BY_FIRST_FIELD = new Map(
  COMBINED_GROUPS.map((g) => [g.fields[0], g])
)
const COMBINED_FIELD_NAMES = new Set(
  COMBINED_GROUPS.flatMap((g) => g.fields)
)
const TOTAL_EXTRA_COLUMNS = Object.values(EXTRA_AFTER_GROUP)
  .reduce((n, arr) => n + arr.length, 0)
const TOTAL_DATA_COLUMNS =
  COMBINED_GROUPS.length +
  TOTAL_EXTRA_COLUMNS +
  (FIELDS.length - COMBINED_FIELD_NAMES.size - HIDDEN_FIELDS.size)

const HOVER_DELAY_MS = 2000

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
  // Tooltip de linha: aparece após 2s de mouse parado
  const [rowTooltip, setRowTooltip] = useState(null)
  const hoverTimerRef = useRef(null)

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

  // Cleanup do timer de tooltip quando o modal fecha
  useEffect(() => () => clearTimeout(hoverTimerRef.current), [])

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
                    <th style={{ minWidth: 100, textAlign: 'center' }}>Justif.</th>
                    {FIELDS.map((f) => {
                      const group = GROUP_BY_FIRST_FIELD.get(f.name)
                      if (group) {
                        const extras = EXTRA_AFTER_GROUP[group.key] || []
                        return (
                          <Fragment key={`g-${group.key}`}>
                            <th style={{
                              minWidth: group.minWidth,
                              textAlign: group.align === 'right' ? 'right' : 'left'
                            }}>
                              {group.label}
                            </th>
                            {extras.map((ex) => (
                              <th key={ex.key} style={{
                                minWidth: ex.minWidth,
                                textAlign: ex.align === 'right' ? 'right' : 'left'
                              }}>
                                {ex.label}
                              </th>
                            ))}
                          </Fragment>
                        )
                      }
                      if (COMBINED_FIELD_NAMES.has(f.name)) return null
                      if (HIDDEN_FIELDS.has(f.name)) return null
                      return (
                        <th key={f.name} style={{
                          minWidth: f.w,
                          textAlign: f.align === 'right' ? 'right' : 'left'
                        }}>{f.label}</th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={TOTAL_DATA_COLUMNS + 1}>
                        <div className="empty-state">Nenhum documento fiscal para este dia com os filtros aplicados.</div>
                      </td>
                    </tr>
                  )}
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className={`details-row ${selectedId === it.id ? 'selected' : ''}`}
                      onClick={() => selectRow(it.id)}
                      onMouseEnter={(e) => {
                        const x = e.clientX, y = e.clientY
                        clearTimeout(hoverTimerRef.current)
                        hoverTimerRef.current = setTimeout(() => {
                          setRowTooltip({
                            id: it.id,
                            x, y,
                            codigo: it.codigoTipoEntrada,
                            descricao: it.descricaoTipoEntrada
                          })
                        }, HOVER_DELAY_MS)
                      }}
                      onMouseLeave={() => {
                        clearTimeout(hoverTimerRef.current)
                        setRowTooltip((prev) => (prev?.id === it.id ? null : prev))
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <span className={`just-badge ${it.justificativasCount > 0 ? 'has' : 'empty'}`}>
                          <MessageSquare size={12} />
                          {it.justificativasCount || 0}
                        </span>
                      </td>
                      {FIELDS.map((f) => {
                        const group = GROUP_BY_FIRST_FIELD.get(f.name)
                        if (group) {
                          const extras = EXTRA_AFTER_GROUP[group.key] || []
                          return (
                            <Fragment key={`g-${group.key}`}>
                              <td
                                className={`doc-cell ${group.align === 'right' ? 'doc-cell-num' : ''}`}
                              >
                                {group.renderBody(it)}
                              </td>
                              {extras.map((ex) => (
                                <td
                                  key={ex.key}
                                  className={`doc-cell ${ex.align === 'right' ? 'doc-cell-num' : ''}`}
                                >
                                  {ex.render(it)}
                                </td>
                              ))}
                            </Fragment>
                          )
                        }
                        if (COMBINED_FIELD_NAMES.has(f.name)) return null
                        if (HIDDEN_FIELDS.has(f.name)) return null
                        return (
                          <td key={f.name} style={{
                            textAlign: f.align === 'right' ? 'right' : 'left',
                            fontVariantNumeric: f.kind === 'numeric' ? 'tabular-nums' : 'normal'
                          }}>
                            {formatValue(f, it[f.name])}
                          </td>
                        )
                      })}
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

      {rowTooltip && (
        <div
          className="row-tooltip"
          style={{
            position: 'fixed',
            left: Math.min(rowTooltip.x + 14, window.innerWidth - 340),
            top:  Math.min(rowTooltip.y + 14, window.innerHeight - 80)
          }}
        >
          <div className="row-tooltip-label">Tipo de Entrada</div>
          <div>
            <strong>{rowTooltip.codigo || '—'}</strong>
            {rowTooltip.descricao ? ` · ${rowTooltip.descricao}` : ''}
          </div>
        </div>
      )}
    </div>
  )
}
