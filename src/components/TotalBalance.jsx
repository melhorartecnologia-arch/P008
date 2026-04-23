import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Maximize2, X as XIcon, ArrowLeft } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  ResponsiveContainer, Tooltip
} from 'recharts'
import { useApi } from '../api.js'
import DayDetailsModal from './DayDetailsModal.jsx'

const GREEN = '#19b26b'
const RED   = '#e5484d'

const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL'
}).format(n)

const fmtBRLCompact = (n) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000)     return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return fmtBRL(n)
}

const fmtDayShort = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}` : iso
}
const fmtDayLong = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
const MONTH_NAMES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const MONTH_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const fmtMonthShort = (iso) => {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(iso || '')
  if (!m) return iso
  return `${MONTH_NAMES[+m[2] - 1]}/${m[1].slice(2)}`
}
const fmtMonthLong = (iso) => {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(iso || '')
  if (!m) return iso
  return `${MONTH_FULL[+m[2] - 1]} de ${m[1]}`
}

function monthBounds(iso) {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(iso || '')
  if (!m) return null
  const year = +m[1], month = +m[2]
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const last = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from: first, to: last, label: fmtMonthLong(first) }
}

function makeVarTooltip(longFmt) {
  return function VarTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const byKey = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]))
    const savings = Number(byKey.savings || 0)
    const overspend = Number(byKey.overspend || 0)
    const net = savings - overspend
    return (
      <div className="perf-tooltip" style={{ minWidth: 180 }}>
        <div className="sub">{longFmt(label)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>NF &lt; Neg</span><span style={{ color: GREEN }}>{fmtBRL(savings)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>NF &gt; Neg</span><span style={{ color: RED }}>{fmtBRL(overspend)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                      marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
          <span>Líquido</span><strong>{fmtBRL(net)}</strong>
        </div>
      </div>
    )
  }
}

// Label compacto sem prefixo "R$" — mais curto pra caber em cima das barras
// sem sobrepor com o vizinho. Esconde valores zero e muito pequenos em
// relação ao máximo da série (para evitar poluição quando há muitos dias).
function makeLabelFormatter(maxValue) {
  const threshold = Math.max(maxValue * 0.06, 1) // 6% do pico da série
  return (v) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0 || n < threshold) return ''
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
    if (abs >= 1_000)     return `${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n)
  }
}

function VariationChart({
  series,
  large = false,
  yAxisWidth = 60,
  granularity = 'day',
  onBarClick
}) {
  const shortFmt = granularity === 'month' ? fmtMonthShort : fmtDayShort
  const longFmt  = granularity === 'month' ? fmtMonthLong  : fmtDayLong
  const Tip = makeVarTooltip(longFmt)
  const clickable = typeof onBarClick === 'function'
  const handleClick = clickable
    ? (payload) => { if (payload?.date) onBarClick(payload) }
    : undefined
  const barStyle = clickable ? { cursor: 'pointer' } : undefined

  const maxSavings   = Math.max(0, ...series.map((d) => Number(d.savings)   || 0))
  const maxOverspend = Math.max(0, ...series.map((d) => Number(d.overspend) || 0))
  const savingsFmt   = makeLabelFormatter(maxSavings)
  const overspendFmt = makeLabelFormatter(maxOverspend)

  const labelFontSize = large ? 12 : 10

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={series}
        barCategoryGap={large ? 12 : 6}
        margin={{ top: large ? 26 : 20, right: 8, bottom: 0, left: -8 }}
      >
        <CartesianGrid stroke="#eef0f3" strokeDasharray="3 4" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortFmt}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: large ? 12 : 10, fill: '#9aa1ac' }}
          interval="preserveStartEnd"
          minTickGap={large ? 8 : 14}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: large ? 12 : 10, fill: '#9aa1ac' }}
          tickFormatter={fmtBRLCompact}
          width={yAxisWidth}
        />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(47, 107, 255, 0.06)' }} />
        <Bar dataKey="savings" fill={GREEN} radius={[3, 3, 0, 0]} onClick={handleClick} style={barStyle}>
          <LabelList
            dataKey="savings"
            position="top"
            offset={4}
            formatter={savingsFmt}
            style={{ fontSize: labelFontSize, fontWeight: 700, fill: '#137a42' }}
          />
        </Bar>
        <Bar dataKey="overspend" fill={RED} radius={[3, 3, 0, 0]} onClick={handleClick} style={barStyle}>
          <LabelList
            dataKey="overspend"
            position="top"
            offset={4}
            formatter={overspendFmt}
            style={{ fontSize: labelFontSize, fontWeight: 700, fill: '#b6242a' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function TotalBalance({ range, filter, codigoFilial }) {
  const [expanded, setExpanded] = useState(false)
  // drill-down: quando o usuário clica numa coluna mensal, fixa o
  // intervalo naquele mês e o endpoint volta a agrupar por dia.
  const [drillDown, setDrillDown] = useState(null)
  // Clique em coluna diária abre o modal de detalhes do dia.
  const [detailsDay, setDetailsDay] = useState(null)

  // Quando o intervalo externo muda, descarta drill-down antigo.
  useEffect(() => { setDrillDown(null) }, [range?.from, range?.to])
  // Idem quando a categoria selecionada muda.
  useEffect(() => { setDrillDown(null) }, [filter?.op, filter?.maxPercent, filter?.minPercent])
  // Idem quando a filial selecionada muda.
  useEffect(() => { setDrillDown(null) }, [codigoFilial])

  const effectiveRange = drillDown || range
  const qsParts = []
  if (effectiveRange?.from && effectiveRange?.to && effectiveRange.from <= effectiveRange.to) {
    qsParts.push(`from=${encodeURIComponent(effectiveRange.from)}`)
    qsParts.push(`to=${encodeURIComponent(effectiveRange.to)}`)
  }
  if (filter?.op === 'lt' || filter?.op === 'gt') {
    qsParts.push(`op=${filter.op}`)
    if (typeof filter.maxPercent === 'number' && filter.maxPercent > 0) {
      qsParts.push(`maxPercent=${filter.maxPercent}`)
    }
    if (typeof filter.minPercent === 'number' && filter.minPercent > 0) {
      qsParts.push(`minPercent=${filter.minPercent}`)
    }
  }
  if (codigoFilial) {
    qsParts.push(`codigoFilial=${encodeURIComponent(codigoFilial)}`)
  }
  const qs = qsParts.length ? `?${qsParts.join('&')}` : ''
  const { data } = useApi(`/entradas-fiscais/metrics/variacao-diaria${qs}`, {
    fallback: { series: [], totals: { savings: 0, overspend: 0, net: 0, buckets: 0 }, granularity: 'day' }
  })

  const series = Array.isArray(data?.series) ? data.series : []
  const totals = data?.totals ?? { savings: 0, overspend: 0, net: 0, buckets: 0 }
  const granularity = data?.granularity === 'month' ? 'month' : 'day'
  const unitLabel = granularity === 'month' ? 'mês' : 'dia'
  const unitLabelPlural = granularity === 'month' ? 'meses' : 'dias'
  const bucketsCount = totals.buckets ?? totals.days ?? series.length
  const netPositive = totals.net >= 0
  const rangeLabel = effectiveRange?.from && effectiveRange?.to
    ? `${fmtDayShort(effectiveRange.from)} — ${fmtDayShort(effectiveRange.to)}`
    : 'Todos os períodos'

  const handleBarClick = useMemo(
    () => (payload) => {
      if (!payload?.date) return
      if (granularity === 'month') {
        const m = monthBounds(payload.date)
        if (m) setDrillDown({ from: m.from, to: m.to, label: m.label })
      } else {
        setDetailsDay(payload.date)
      }
    },
    [granularity]
  )

  useEffect(() => {
    if (!expanded) return
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="card-title">Total Balance</span>
          <button
            className="card-arrow"
            aria-label="Expandir gráfico"
            title="Expandir gráfico"
            onClick={() => setExpanded(true)}
          >
            <ArrowUpRight size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em',
            color: netPositive ? GREEN : RED
          }}>
            {fmtBRLCompact(totals.net)}
          </div>
          <span className="balance-sub">{rangeLabel}</span>
          {filter?.label && (
            <span
              className="category-pill"
              title="Clique no mesmo card novamente para limpar"
              style={{
                background: `${filter.color}1A`,
                color: filter.color,
                borderColor: `${filter.color}55`
              }}
            >
              {filter.label}
            </span>
          )}
        </div>

        {drillDown && (
          <button
            type="button"
            className="drill-back-pill"
            onClick={() => setDrillDown(null)}
            title="Voltar à visão mensal"
          >
            <ArrowLeft size={12} />
            <span>Detalhe de <strong>{drillDown.label}</strong> · voltar</span>
          </button>
        )}

        <div style={{ height: 200, marginTop: 10 }}>
          <VariationChart
            series={series}
            granularity={granularity}
            onBarClick={handleBarClick}
          />
        </div>

        <div className="legend">
          <span className="legend-item"><span className="dot" style={{ background: GREEN }} />NF &lt; Negociado</span>
          <span className="legend-item"><span className="dot" style={{ background: RED }} />NF &gt; Negociado</span>
          <span className="legend-item" style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>
            {bucketsCount} {bucketsCount === 1 ? unitLabel : unitLabelPlural}
            <span style={{ marginLeft: 4, opacity: 0.7 }}>
              {granularity === 'month'
                ? '(mensal · clique para detalhar)'
                : '(diário · clique para ver documentos)'}
            </span>
          </span>
        </div>
      </div>

      {expanded && (
        <div
          className="modal-backdrop chart-modal"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setExpanded(false) }}
        >
          <div className="modal modal-chart" role="dialog" aria-modal="true">
            <div className="modal-head chart-modal-head">
              <div>
                <h2>Total Balance · Variação {granularity === 'month' ? 'mensal' : 'diária'}</h2>
                <p>
                  NF &lt; Negociado vs. NF &gt; Negociado · {rangeLabel} ·
                  {' '}{bucketsCount} {bucketsCount === 1 ? unitLabel : unitLabelPlural}
                  {granularity === 'month' && ' · clique em uma coluna para ver o detalhe diário'}
                </p>
                {drillDown && (
                  <button
                    type="button"
                    className="drill-back-pill"
                    onClick={() => setDrillDown(null)}
                    title="Voltar à visão mensal"
                    style={{ marginTop: 6 }}
                  >
                    <ArrowLeft size={12} />
                    <span>Detalhe de <strong>{drillDown.label}</strong> · voltar</span>
                  </button>
                )}
              </div>
              <div className="chart-modal-actions">
                <div className="chart-modal-net">
                  <span>Líquido</span>
                  <strong style={{ color: netPositive ? GREEN : RED }}>
                    {fmtBRL(totals.net)}
                  </strong>
                </div>
                <button
                  className="card-arrow"
                  aria-label="Fechar"
                  title="Fechar (Esc)"
                  onClick={() => setExpanded(false)}
                >
                  <XIcon size={16} />
                </button>
              </div>
            </div>

            <div className="modal-body chart-modal-body">
              <VariationChart
                series={series}
                large
                yAxisWidth={80}
                granularity={granularity}
                onBarClick={handleBarClick}
              />
            </div>

            <div className="modal-foot chart-modal-foot">
              <div className="legend" style={{ margin: 0 }}>
                <span className="legend-item"><span className="dot" style={{ background: GREEN }} />NF &lt; Negociado</span>
                <span className="legend-item"><span className="dot" style={{ background: RED }} />NF &gt; Negociado</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setExpanded(false)}
              >
                <Maximize2 size={14} style={{ transform: 'rotate(180deg)' }} />
                <span>Reduzir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {detailsDay && (
        <DayDetailsModal
          range={{ from: detailsDay, to: detailsDay }}
          codigoFilial={codigoFilial}
          filter={filter}
          onClose={() => setDetailsDay(null)}
        />
      )}
    </>
  )
}
