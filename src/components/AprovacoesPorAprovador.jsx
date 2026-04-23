import { ArrowUpRight, UserCheck, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useApi } from '../api.js'

const GREEN = '#19b26b'
const RED   = '#c01d22'
const MUTED = '#9aa1ac'

const fmtBRL = (n) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL'
}).format(Number(n || 0))

const fmtBRLCompact = (n) => {
  const v = Number(n || 0)
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
  if (abs >= 1_000)     return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  return fmtBRL(v)
}

const fmtInt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n || 0))

const fmtPct = (p) => {
  if (p == null || !Number.isFinite(Number(p))) return '—'
  const v = Number(p)
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

function toneOf(net) {
  if (net > 0) return 'ok'
  if (net < 0) return 'bad'
  return 'neutral'
}
function toneColor(net) {
  if (net > 0) return GREEN
  if (net < 0) return RED
  return MUTED
}
function toneIcon(net, size = 12) {
  if (net > 0) return <TrendingUp size={size} />
  if (net < 0) return <TrendingDown size={size} />
  return <Minus size={size} />
}

export default function AprovacoesPorAprovador({ range, codigoFilial }) {
  const parts = []
  if (range?.from && range?.to && range.from <= range.to) {
    parts.push(`from=${encodeURIComponent(range.from)}`)
    parts.push(`to=${encodeURIComponent(range.to)}`)
  }
  if (codigoFilial) parts.push(`codigoFilial=${encodeURIComponent(codigoFilial)}`)
  const qs = parts.length ? `?${parts.join('&')}` : ''

  const fallback = {
    rows: [],
    totals: {
      docsAprovados: 0, valorAprovadoTotal: 0, itensFiscais: 0,
      savings: 0, overspend: 0, net: 0, valorBase: 0, variacaoPercentual: null
    }
  }
  const { data } = useApi(`/aprovacoes-entradas-fiscais/metrics/por-aprovador${qs}`, { fallback })
  const rows   = Array.isArray(data?.rows) ? data.rows : []
  const totals = data?.totals ?? fallback.totals

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">
          <UserCheck size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          Aprovações por comprador
        </span>
        <button className="card-arrow" aria-label="Open">
          <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="aprov-wrap">
        <table className="crud-table aprov-table">
          <thead>
            <tr>
              <th style={{ minWidth: 170 }}>Aprovador</th>
              <th style={{ textAlign: 'right' }}>Docs</th>
              <th style={{ textAlign: 'right' }}>Valor aprov.</th>
              <th style={{ textAlign: 'right' }}>Itens NF</th>
              <th style={{ textAlign: 'right', color: GREEN }}>Economia</th>
              <th style={{ textAlign: 'right', color: RED }}>Sobrecusto</th>
              <th style={{ textAlign: 'right' }}>Variação</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">Nenhuma aprovação no período.</div>
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const tone = toneOf(r.net)
              return (
                <tr key={r.codigoAprovador}>
                  <td>
                    <div className="aprov-name">
                      <strong>{r.codigoAprovador}</strong>
                      <small>{r.nomeAprovador || '—'}</small>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtInt(r.docsAprovados)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                    {fmtBRLCompact(r.valorAprovadoTotal)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.itensFiscais > 0
                      ? fmtInt(r.itensFiscais)
                      : <span className="nf-muted">—</span>}
                  </td>
                  <td style={{ textAlign: 'right', color: GREEN, fontVariantNumeric: 'tabular-nums' }}>
                    {r.savings > 0 ? fmtBRLCompact(r.savings) : <span className="nf-muted">—</span>}
                  </td>
                  <td style={{ textAlign: 'right', color: RED, fontVariantNumeric: 'tabular-nums' }}>
                    {r.overspend > 0 ? fmtBRLCompact(r.overspend) : <span className="nf-muted">—</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <span className={`aprov-net tone-${tone}`} style={{ color: toneColor(r.net) }}>
                      {toneIcon(r.net)}
                      <strong>{fmtBRLCompact(r.net)}</strong>
                      <small>{fmtPct(r.variacaoPercentual)}</small>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <strong>{fmtInt(totals.docsAprovados)}</strong>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <strong>{fmtBRLCompact(totals.valorAprovadoTotal)}</strong>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <strong>{fmtInt(totals.itensFiscais)}</strong>
                </td>
                <td style={{ textAlign: 'right', color: GREEN, fontVariantNumeric: 'tabular-nums' }}>
                  <strong>{fmtBRLCompact(totals.savings)}</strong>
                </td>
                <td style={{ textAlign: 'right', color: RED, fontVariantNumeric: 'tabular-nums' }}>
                  <strong>{fmtBRLCompact(totals.overspend)}</strong>
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <span className={`aprov-net tone-${toneOf(totals.net)}`} style={{ color: toneColor(totals.net) }}>
                    {toneIcon(totals.net)}
                    <strong>{fmtBRLCompact(totals.net)}</strong>
                    <small>{fmtPct(totals.variacaoPercentual)}</small>
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
