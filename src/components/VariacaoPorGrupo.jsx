import { ArrowUpRight, Layers, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useApi } from '../api.js'

const GREEN        = '#19b26b'
const RED          = '#e5484d'
const RED_DEEP     = '#c01d22'
const YELLOW       = '#b8700e'
const MUTED        = '#9aa1ac'

const SCENARIOS = [
  { key: 'lt',    label: 'NF < Negociado',          color: GREEN,    dot: '#19b26b' },
  { key: 'gt',    label: 'NF > Negociado',          color: RED,      dot: '#e5484d' },
  { key: 'gtLe2', label: 'NF > Negociado (até 2%)', color: YELLOW,   dot: '#f5c518' },
  { key: 'gtGt2', label: 'NF > Negociado (>2%)',    color: RED_DEEP, dot: '#c01d22' }
]

const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL'
}).format(n)

const fmtBRLCompact = (n) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000)     return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return fmtBRL(n)
}

const fmtInt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n || 0))

function ScenarioCell({ cell, color }) {
  const value = Number(cell?.value ?? 0)
  const count = Number(cell?.count ?? 0)
  if (count === 0 && value === 0) {
    return <span className="nf-muted">—</span>
  }
  return (
    <div className="scen-cell" style={{ color }}>
      <strong>{fmtBRLCompact(value)}</strong>
      <small>{fmtInt(count)} {count === 1 ? 'item' : 'itens'}</small>
    </div>
  )
}

export default function VariacaoPorGrupo({ range, codigoFilial, onCellClick }) {
  const parts = []
  if (range?.from && range?.to && range.from <= range.to) {
    parts.push(`from=${encodeURIComponent(range.from)}`)
    parts.push(`to=${encodeURIComponent(range.to)}`)
  }
  if (codigoFilial) parts.push(`codigoFilial=${encodeURIComponent(codigoFilial)}`)
  const qs = parts.length ? `?${parts.join('&')}` : ''

  const fallback = {
    groups: [],
    totals: {
      count: 0, savings: 0, overspend: 0, net: 0, valorTotal: 0,
      scenarios: {
        lt:    { count: 0, value: 0 },
        gt:    { count: 0, value: 0 },
        gtLe2: { count: 0, value: 0 },
        gtGt2: { count: 0, value: 0 }
      }
    }
  }
  const { data } = useApi(`/entradas-fiscais/metrics/variacao-por-grupo${qs}`, { fallback })

  const groups = Array.isArray(data?.groups) ? data.groups : []
  const totals = data?.totals ?? fallback.totals

  const clickable = typeof onCellClick === 'function'
  const cellProps = (grupo, scenarioKey) => clickable
    ? {
        className: 'clickable-cell',
        role: 'button',
        tabIndex: 0,
        onClick: () => onCellClick(grupo, scenarioKey),
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onCellClick(grupo, scenarioKey)
          }
        }
      }
    : {}

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          <Layers size={13} />
          <span>Variação por Grupo de Produtos</span>
          {clickable && (
            <span className="card-hint">clique em qualquer célula para ver os documentos</span>
          )}
        </span>
        <button className="card-arrow" aria-label="Open">
          <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="table-wrap">
        <table className="table grupo-variacao-table">
          <thead>
            <tr>
              <th rowSpan={2}>Grupo</th>
              <th rowSpan={2} style={{ textAlign: 'right' }}>Itens</th>
              <th colSpan={4} className="scen-group-head">Por cenário NF × Negociado</th>
              <th rowSpan={2} style={{ textAlign: 'right' }}>Saldo</th>
              <th rowSpan={2}>Status</th>
            </tr>
            <tr>
              {SCENARIOS.map((s) => (
                <th key={s.key} className="scen-col-head" style={{ textAlign: 'right' }}>
                  <span className="dot" style={{ background: s.dot }} />
                  <span>{s.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state" style={{ padding: 20 }}>
                    Nenhum grupo com variação nos filtros atuais.
                    <br />
                    <small>
                      Pode ser necessário rodar <strong>Classificar grupos</strong>
                      em Entradas Fiscais.
                    </small>
                  </div>
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const positive = g.net >= 0
              const StatusIcon = g.net === 0 ? Minus : (positive ? TrendingUp : TrendingDown)
              const statusColor = g.net === 0 ? MUTED : (positive ? GREEN : RED)
              const statusLabel = g.net === 0 ? 'Sem divergência'
                                 : positive    ? 'Economia'
                                               : 'Sobrepreço'
              return (
                <tr key={g.grupoId ?? 'null'} className={clickable ? 'clickable-row' : ''}>
                  <td {...cellProps(g, null)}>
                    <div className="grupo-cell">
                      <span className="grupo-pill" title={g.descricao || ''}>
                        <Layers size={10} />
                        {g.codigo || 'Sem grupo'}
                      </span>
                      <span className="grupo-desc" title={g.descricao || ''}>
                        {g.descricao || 'Não classificado'}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                      {...cellProps(g, null)}>
                    {fmtInt(g.count)}
                  </td>
                  {SCENARIOS.map((s) => (
                    <td key={s.key} style={{ textAlign: 'right' }} {...cellProps(g, s.key)}>
                      <ScenarioCell cell={g.scenarios?.[s.key]} color={s.color} />
                    </td>
                  ))}
                  <td style={{
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                    color: statusColor
                  }}
                      {...cellProps(g, null)}>
                    {g.net === 0 ? '—' : fmtBRLCompact(g.net)}
                  </td>
                  <td {...cellProps(g, null)}>
                    <span className="status-pill" style={{ color: statusColor }}>
                      <StatusIcon size={12} />
                      {statusLabel}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {groups.length > 0 && (
            <tfoot>
              <tr className={clickable ? 'clickable-row' : ''}>
                <td {...cellProps(null, null)}>
                  <strong style={{ color: 'var(--text-2)' }}>Total</strong>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
                    {...cellProps(null, null)}>
                  {fmtInt(totals.count)}
                </td>
                {SCENARIOS.map((s) => (
                  <td key={s.key} style={{ textAlign: 'right' }} {...cellProps(null, s.key)}>
                    <ScenarioCell cell={totals.scenarios?.[s.key]} color={s.color} />
                  </td>
                ))}
                <td style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  color: totals.net >= 0 ? GREEN : RED
                }}
                    {...cellProps(null, null)}>
                  {fmtBRLCompact(totals.net)}
                </td>
                <td style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.3 }}
                    {...cellProps(null, null)}>
                  <div><span style={{ color: GREEN }}>▲ {fmtBRLCompact(totals.savings)}</span></div>
                  <div><span style={{ color: RED }}>▼ {fmtBRLCompact(totals.overspend)}</span></div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
