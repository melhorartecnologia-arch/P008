import { ArrowUpRight, TrendingDown, TrendingUp, CalendarRange } from 'lucide-react'
import { useApi } from '../api.js'

const fmtInt = (n) => new Intl.NumberFormat('pt-BR').format(n)
const fmtMoney = (n) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL'
}).format(n)
const fmtPct = (n) => new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1, maximumFractionDigits: 2
}).format(n)

function fmtRangeLabel(range) {
  if (!range?.from || !range?.to) return null
  const br = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s
  }
  return `${br(range.from)} – ${br(range.to)}`
}

/**
 * Card que consome um endpoint de métrica "NF vs. Negociado":
 *   endpoint: '/entradas-fiscais/metrics/nf-menor-que-negociado' ou
 *             '/entradas-fiscais/metrics/nf-maior-que-negociado'
 * props extras: title, dotColor, range={from,to}
 */
export default function NfVariationCard({
  endpoint,
  title,
  dotColor = '#e5484d',
  range,
  valorizacaoLabel = 'Valorização',
  trend = 'down',
  maxPercent,
  minPercent,
  codigoFilial,
  onClick,
  onContextMenu,
  selected = false
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown
  const validRange = range?.from && range?.to && range.from <= range.to
  const qs = []
  if (validRange) {
    qs.push(`from=${encodeURIComponent(range.from)}`)
    qs.push(`to=${encodeURIComponent(range.to)}`)
  }
  if (typeof maxPercent === 'number' && Number.isFinite(maxPercent) && maxPercent > 0) {
    qs.push(`maxPercent=${encodeURIComponent(maxPercent)}`)
  }
  if (typeof minPercent === 'number' && Number.isFinite(minPercent) && minPercent > 0) {
    qs.push(`minPercent=${encodeURIComponent(minPercent)}`)
  }
  if (codigoFilial) {
    qs.push(`codigoFilial=${encodeURIComponent(codigoFilial)}`)
  }
  const query = qs.length ? `?${qs.join('&')}` : ''
  const { data: nf, loading } = useApi(`${endpoint}${query}`, {
    fallback: { count: 0, total: 0, percent: 0, valorizacao: 0, valorTotal: 0, percentValorizacao: 0 }
  })

  const valorizacao        = Number(nf?.valorizacao ?? 0)
  const valorTotal         = Number(nf?.valorTotal ?? 0)
  const percentValorizacao = Number(nf?.percentValorizacao ?? 0)
  const count              = Number(nf?.count ?? 0)
  const total              = Number(nf?.total ?? 0)
  const percentItens       = Number(nf?.percent ?? 0)
  const rangeLabel = fmtRangeLabel(range)

  const clickable = typeof onClick === 'function'
  return (
    <div
      className={`card nf-card ${clickable ? 'nf-card-clickable' : ''} ${selected ? 'nf-card-selected' : ''}`}
      style={selected ? { borderColor: dotColor, boxShadow: `0 0 0 2px ${dotColor}33` } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? selected : undefined}
      onClick={clickable ? onClick : undefined}
      onContextMenu={typeof onContextMenu === 'function'
        ? (e) => { e.preventDefault(); onContextMenu(e) }
        : undefined}
      onKeyDown={clickable
        ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }
        : undefined}
      title={typeof onContextMenu === 'function' ? 'Clique direito para ver documentos deste filtro' : undefined}
    >
      <div className="card-head">
        <span className="card-title">
          <span className="dot" style={{ background: dotColor }} />
          {title}
        </span>
        <button
          className="card-arrow"
          aria-label="Open"
          onClick={(e) => { e.stopPropagation() }}
        >
          <ArrowUpRight size={14} />
        </button>
      </div>

      {rangeLabel && (
        <div className="nf-period">
          <CalendarRange size={12} />
          <span>{rangeLabel}</span>
          {loading && <span className="nf-loading">carregando…</span>}
        </div>
      )}

      <div className="nf-primary">
        <span className="nf-sublabel">{valorizacaoLabel}</span>
        <div className="nf-value-xl" style={{ color: dotColor }}>{fmtMoney(valorizacao)}</div>
        <div className={`stat-delta ${trend}`}>
          <TrendIcon size={13} />
          <span>{fmtPct(percentValorizacao)}% do valor total</span>
        </div>
      </div>

      <div className="nf-grid">
        <div className="nf-cell">
          <span className="nf-sublabel">Valor total</span>
          <div className="nf-value-md">{fmtMoney(valorTotal)}</div>
        </div>
        <div className="nf-cell">
          <span className="nf-sublabel">Itens</span>
          <div className="nf-value-sm">
            <strong>{fmtInt(count)}</strong>
            <span className="nf-muted"> de {fmtInt(total)} · {fmtPct(percentItens)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
