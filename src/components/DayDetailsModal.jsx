import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  X as XIcon, MessageSquarePlus, MessageSquare, Trash2, Send, CalendarDays, Loader2,
  ChevronUp, ChevronDown, ChevronsUpDown
} from 'lucide-react'
import { apiGet, apiSend } from '../api.js'
import { FIELDS, formatValue } from '../pages/entradasFiscaisFields.js'

const BASE = import.meta.env.VITE_API_BASE || '/api'

// Valores unitários (NF / Negociado / aside) usam 4 casas decimais
// para preservar a precisão por unidade (ex.: R$ 1,2345). Já o total
// da Variação (R$) e o Valor de entrada (NF) são valores "cheios"
// e ficam em 2 casas decimais para facilitar a leitura.
const makeMoney = (digits, { currency } = {}) => (v) => {
  if (v === null || v === undefined || v === '') return currency ? '—' : ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  const opts = {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }
  if (currency) { opts.style = 'currency'; opts.currency = 'BRL' }
  return new Intl.NumberFormat('pt-BR', opts).format(n)
}
const fmtMoney       = makeMoney(4, { currency: true })
const fmtMoneyPlain  = makeMoney(4)
const fmtMoney2      = makeMoney(2, { currency: true })
const fmtMoneyPlain2 = makeMoney(2)
const fmtQty = (n) => (n != null && n !== '')
  ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(Number(n))
  : '—'

// Mesma fórmula usada nos cards de variação (server: `computeNfVsNegociado`
// e `/metrics/variacao-diaria`). `valorNegociadoCompras` e `valorNotaFiscal`
// já são valores unitários — a variação R$ por documento é:
//   quantidade_escriturada × (valor_negociado_compras − valor_nota_fiscal)
// Sinal positivo = economia; negativo = sobrecusto.
const computeVariation = (it) => {
  const qtdNf  = Number(it.quantidadeEscriturada)
  const valNeg = Number(it.valorNegociadoCompras)
  const valNf  = Number(it.valorNotaFiscal)
  if (!Number.isFinite(qtdNf))  return null
  if (!Number.isFinite(valNeg) || !Number.isFinite(valNf)) return null
  return qtdNf * (valNeg - valNf)
}

// Variação percentual baseada nos valores unitários:
//   (valor_negociado_compras − valor_nota_fiscal) / valor_negociado_compras
const computeVariationPct = (it) => {
  const valNeg = Number(it.valorNegociadoCompras)
  const valNf  = Number(it.valorNotaFiscal)
  if (!Number.isFinite(valNeg) || valNeg === 0) return null
  if (!Number.isFinite(valNf)) return null
  return ((valNeg - valNf) / valNeg) * 100
}

const fmtPct = (p) => {
  if (p == null || !Number.isFinite(p)) return '—'
  const sign = p > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(p)}%`
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
        const v   = computeVariation(it)
        const pct = computeVariationPct(it)
        if (v == null) return <span className="doc-line doc-muted">—</span>
        const tone = v > 0 ? 'ok' : v < 0 ? 'bad' : 'neutral'
        return (
          <>
            <span className={`doc-line doc-main var-${tone}`}>
              {fmtMoney2(v)}
            </span>
            <span className={`doc-line doc-muted var-${tone}`}>
              {fmtPct(pct)}
            </span>
          </>
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
const toNum = (v) => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Variantes de ordenação por coluna fundida. A primeira entrada é a
// ordem padrão; as demais ficam acessíveis via mini-botões no cabeçalho.
const GROUP_VARIANTS = {
  documento: [
    { key: 'nf',     label: 'nº NF', accessor: (it) => it.numeroDocumentoFiscal },
    { key: 'filial', label: 'filial', accessor: (it) => it.codigoFilial }
  ],
  produto: [
    { key: 'desc', label: 'descrição', accessor: (it) => it.descricaoProduto },
    { key: 'cod',  label: 'código',    accessor: (it) => it.codigoProduto }
  ],
  pedido: [
    { key: 'num',  label: 'nº',   accessor: (it) => it.numeroPedidoCompras },
    { key: 'tipo', label: 'tipo', accessor: (it) => it.tipoPedidoCompras }
  ],
  nfFornecedor: [
    { key: 'valor', label: 'valor', accessor: (it) => toNum(it.valorNotaFiscal) },
    { key: 'qtd',   label: 'qtd',   accessor: (it) => toNum(it.quantidadeEscriturada) }
  ],
  negociado: [
    { key: 'valor', label: 'valor', accessor: (it) => toNum(it.valorNegociadoCompras) },
    { key: 'qtd',   label: 'qtd',   accessor: (it) => toNum(it.quantidadePedidoCompras) }
  ]
}

// Variantes para colunas calculadas (Variação = valor em R$ + percentual).
const EXTRA_VARIANTS = {
  variacaoMonetaria: [
    { key: 'rs',  label: 'R$', accessor: (it) => computeVariation(it) },
    { key: 'pct', label: '%',  accessor: (it) => computeVariationPct(it) }
  ]
}

const DEFAULT_VARIANT = '__default__'

// Farol de cada linha seguindo as regras dos 4 cards do dashboard:
//   NF < Negociado                → verde
//   NF > Negociado (até 2%)       → amarelo
//   NF > Negociado (acima de 2%)  → vermelho
// Empate (NF = Negociado) cai num tom neutro; linhas sem dados
// ficam cinza-claro.
const FAROL_NONE = { key: 'none', color: '#c5cad2', label: 'Sem dados suficientes', rank: 9 }
function trafficLight(it) {
  const valNeg = Number(it.valorNegociadoCompras)
  const valNf  = Number(it.valorNotaFiscal)
  if (!Number.isFinite(valNeg) || valNeg === 0 || !Number.isFinite(valNf)) return FAROL_NONE
  const pct = ((valNf - valNeg) / valNeg) * 100
  if (pct < 0)   return { key: 'lt',  color: '#19b26b', label: 'NF < Negociado',             rank: 0 }
  if (pct === 0) return { key: 'eq',  color: '#98a2b3', label: 'NF = Negociado',             rank: 1 }
  if (pct <= 2)  return { key: 'le2', color: '#f5c518', label: 'NF > Negociado (até 2%)',    rank: 2 }
  return            { key: 'gt2',      color: '#c01d22', label: 'NF > Negociado (acima de 2%)', rank: 3 }
}

// Monta a lista plana de colunas na mesma ordem em que é renderizada,
// com metadados para ordenação (accessor) e filtro (matchText).
function buildColumns() {
  const cols = []

  cols.push({
    key: '__farol',
    label: 'Status',
    minWidth: 72,
    align: 'center',
    sortVariants: [
      { key: DEFAULT_VARIANT, label: '', accessor: (it) => trafficLight(it).rank }
    ],
    matchText: (it, needle) => {
      const t = trafficLight(it)
      return t.label.toLowerCase().includes(needle) || t.key.toLowerCase().includes(needle)
    },
    renderBody: (it) => {
      const t = trafficLight(it)
      return <span className="farol" title={t.label} style={{ background: t.color }} />
    },
    tdStyle: { textAlign: 'center' }
  })

  cols.push({
    key: '__justif',
    label: 'Justif.',
    minWidth: 100,
    align: 'center',
    kind: 'number',
    sortVariants: [
      { key: DEFAULT_VARIANT, label: '', accessor: (it) => it.justificativasCount || 0 }
    ],
    matchText: (it, needle) => String(it.justificativasCount || 0).includes(needle),
    renderBody: (it) => (
      <span className={`just-badge ${it.justificativasCount > 0 ? 'has' : 'empty'}`}>
        <MessageSquare size={12} />
        {it.justificativasCount || 0}
      </span>
    ),
    tdStyle: { textAlign: 'center' }
  })

  for (const f of FIELDS) {
    const group = GROUP_BY_FIRST_FIELD.get(f.name)
    if (group) {
      const isNumeric = group.align === 'right'
      const variants = GROUP_VARIANTS[group.key] || [
        { key: DEFAULT_VARIANT, label: '',
          accessor: (it) => {
            const v = it[group.fields[0]]
            if (v == null || v === '') return null
            return isNumeric ? Number(v) : v
          } }
      ]
      cols.push({
        key: `g-${group.key}`,
        label: group.label,
        minWidth: group.minWidth,
        align: group.align,
        kind: isNumeric ? 'number' : 'string',
        sortVariants: variants,
        matchText: (it, needle) => group.fields.some((fn) => {
          const v = it[fn]
          return v != null && String(v).toLowerCase().includes(needle)
        }),
        renderBody: group.renderBody,
        tdClassName: `doc-cell ${isNumeric ? 'doc-cell-num' : ''}`
      })
      for (const ex of EXTRA_AFTER_GROUP[group.key] || []) {
        const variants = EXTRA_VARIANTS[ex.key] || [
          { key: DEFAULT_VARIANT, label: '', accessor: () => null }
        ]
        const mainAccessor = variants[0].accessor
        cols.push({
          key: ex.key,
          label: ex.label,
          minWidth: ex.minWidth,
          align: ex.align,
          kind: 'number',
          sortVariants: variants,
          matchText: mainAccessor
            ? (it, needle) => {
                const v = mainAccessor(it)
                if (v == null) return false
                return fmtMoney2(v).toLowerCase().includes(needle)
                    || String(v).toLowerCase().includes(needle)
              }
            : undefined,
          renderBody: ex.render,
          tdClassName: `doc-cell ${ex.align === 'right' ? 'doc-cell-num' : ''}`
        })
      }
      continue
    }
    if (COMBINED_FIELD_NAMES.has(f.name)) continue
    if (HIDDEN_FIELDS.has(f.name)) continue
    cols.push({
      key: f.name,
      label: f.label,
      minWidth: f.w,
      align: f.align,
      kind: f.kind === 'numeric' ? 'number' : f.kind === 'date' ? 'date' : 'string',
      sortVariants: [
        { key: DEFAULT_VARIANT, label: '',
          accessor: (it) => {
            const v = it[f.name]
            if (v == null || v === '') return null
            return f.kind === 'numeric' ? Number(v) : v
          } }
      ],
      matchText: (it, needle) => {
        const v = it[f.name]
        if (v == null) return false
        if (String(v).toLowerCase().includes(needle)) return true
        const formatted = f.money ? fmtMoneyPlain2(v) : formatValue(f, v)
        return String(formatted).toLowerCase().includes(needle)
      },
      renderBody: (it) => (
        f.money ? fmtMoneyPlain2(it[f.name]) : formatValue(f, it[f.name])
      ),
      tdStyle: {
        textAlign: f.align === 'right' ? 'right' : 'left',
        fontVariantNumeric: f.kind === 'numeric' ? 'tabular-nums' : 'normal'
      }
    })
  }
  return cols
}

const COLUMNS = buildColumns()

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
  // Ordenação e filtros por coluna (client-side, como na DataTable).
  const [sort, setSort] = useState(null)
  const [filters, setFilters] = useState({})
  // Tooltip de linha: aparece após 2s de mouse parado
  const [rowTooltip, setRowTooltip] = useState(null)
  const hoverTimerRef = useRef(null)

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, v]) => v && String(v).trim() !== ''),
    [filters]
  )

  const displayItems = useMemo(() => {
    let out = items
    if (activeFilters.length) {
      out = out.filter((it) => activeFilters.every(([key, value]) => {
        const col = COLUMNS.find((c) => c.key === key)
        if (!col?.matchText) return true
        return col.matchText(it, String(value).toLowerCase())
      }))
    }
    if (sort) {
      const col = COLUMNS.find((c) => c.key === sort.key)
      const variant = col?.sortVariants?.find((v) => v.key === sort.variant)
                   || col?.sortVariants?.[0]
      if (variant?.accessor) {
        const mul = sort.dir === 'desc' ? -1 : 1
        out = [...out].sort((a, b) => {
          const av = variant.accessor(a)
          const bv = variant.accessor(b)
          if (av === bv) return 0
          if (av == null) return 1
          if (bv == null) return -1
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul
          const as = String(av).toLowerCase()
          const bs = String(bv).toLowerCase()
          return as < bs ? -mul : as > bs ? mul : 0
        })
      }
    }
    return out
  }, [items, activeFilters, sort])

  // Alterna ordenação por coluna + variante.
  // Ciclo:
  //   nada          → asc (variante pedida)
  //   asc  mesma    → desc
  //   desc mesma    → nada
  //   variante outra → asc (variante nova)
  function toggleSort(key, variant = DEFAULT_VARIANT) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, variant, dir: 'asc' }
      if (prev.variant !== variant) return { key, variant, dir: 'asc' }
      if (prev.dir === 'asc') return { key, variant, dir: 'desc' }
      return null
    })
  }
  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

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
              {loading
                ? 'Carregando…'
                : activeFilters.length
                  ? `${displayItems.length} de ${items.length} documento${items.length === 1 ? '' : 's'} fiscal(is)`
                  : `${items.length} documento${items.length === 1 ? '' : 's'} fiscal(is)`}
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
                    {COLUMNS.map((col) => {
                      const variants = col.sortVariants || []
                      const multi = variants.length > 1
                      const activeVariantKey = sort?.key === col.key ? sort.variant : null
                      const isActive = !!activeVariantKey
                      const justify = col.align === 'right' ? 'flex-end'
                                    : col.align === 'center' ? 'center' : 'flex-start'
                      const textAlign = col.align === 'right' ? 'right'
                                      : col.align === 'center' ? 'center' : 'left'
                      return (
                        <th
                          key={col.key}
                          style={{
                            minWidth: col.minWidth,
                            textAlign,
                            cursor: multi ? 'default' : 'pointer',
                            userSelect: 'none'
                          }}
                          onClick={multi ? undefined : () => toggleSort(col.key)}
                          aria-sort={isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <span className="th-inner" style={{ justifyContent: justify }}>
                            <span>{col.label}</span>
                            {!multi && (
                              <span className={`sort-ind ${isActive ? '' : 'sort-ind-dim'}`}>
                                {isActive
                                  ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                                  : <ChevronsUpDown size={12} />}
                              </span>
                            )}
                          </span>
                          {multi && (
                            <div className="col-variants" style={{ justifyContent: justify }}>
                              {variants.map((v) => {
                                const vActive = activeVariantKey === v.key
                                return (
                                  <button
                                    key={v.key}
                                    type="button"
                                    className={`col-variant ${vActive ? 'active' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); toggleSort(col.key, v.key) }}
                                    title={`Ordenar por ${v.label}`}
                                  >
                                    <span>{v.label}</span>
                                    {vActive
                                      ? (sort.dir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
                                      : <ChevronsUpDown size={10} className="col-variant-dim" />}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="filter-row">
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="filter-cell"
                        style={{ minWidth: col.minWidth }}
                      >
                        {col.matchText
                          ? <input
                              type="text"
                              placeholder="filtrar…"
                              value={filters[col.key] ?? ''}
                              onChange={(e) => setFilter(col.key, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="col-filter-input"
                            />
                          : <span className="filter-placeholder" />
                        }
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!loading && displayItems.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length}>
                        <div className="empty-state">
                          {activeFilters.length
                            ? 'Nenhum documento fiscal atende aos filtros aplicados.'
                            : 'Nenhum documento fiscal para este dia com os filtros aplicados.'}
                        </div>
                      </td>
                    </tr>
                  )}
                  {displayItems.map((it) => (
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
                      {COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={col.tdClassName || ''}
                          style={col.tdStyle}
                        >
                          {col.renderBody(it)}
                        </td>
                      ))}
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
                      <strong>{fmtMoneyPlain(selected.valorNotaFiscal)}</strong>
                    </div>
                    <div className="details-divergence-row">
                      <span>Valor negociado</span>
                      <strong>{fmtMoneyPlain(selected.valorNegociadoCompras)}</strong>
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
