import { useMemo, useState } from 'react'
import TopBar, {
  PERIOD_THIS_MONTH, PERIOD_LAST_MONTH
} from '../components/TopBar.jsx'
import TotalBalance from '../components/TotalBalance.jsx'
import Performance from '../components/Performance.jsx'
import VariacaoPorGrupo from '../components/VariacaoPorGrupo.jsx'
import NfVariationCard from '../components/NfVariationCard.jsx'
import DayDetailsModal from '../components/DayDetailsModal.jsx'
import { useApi } from '../api.js'

function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function monthRange(offset = 0) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last  = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  return { from: toISODate(first), to: toISODate(last) }
}

const SCENARIO_META = {
  lt:    { op: 'lt', label: 'NF < Negociado',          color: '#19b26b' },
  gt:    { op: 'gt', label: 'NF > Negociado',          color: '#e5484d' },
  gtLe2: { op: 'gt', maxPercent: 2, label: 'NF > Negociado (até 2%)',    color: '#f5c518' },
  gtGt2: { op: 'gt', minPercent: 2, label: 'NF > Negociado (acima de 2%)', color: '#c01d22' }
}

function buildFilterForCell(grupo, scenarioKey) {
  const scen = scenarioKey ? SCENARIO_META[scenarioKey] : null
  const parts = []
  if (grupo?.codigo) parts.push(grupo.codigo)
  else if (grupo && grupo.grupoId === null) parts.push('Sem grupo')
  if (scen) parts.push(scen.label)
  const label = parts.join(' · ') || 'Todos os itens'
  const color = scen?.color || '#2f6bff'
  return {
    label,
    color,
    op: scen?.op,
    maxPercent: scen?.maxPercent,
    minPercent: scen?.minPercent
  }
}

const CARDS = [
  {
    key: 'lt',
    title: 'Itens NF < Negociado',
    dotColor: '#19b26b',
    trend: 'up',
    endpoint: '/entradas-fiscais/metrics/nf-menor-que-negociado',
    filter: { op: 'lt' }
  },
  {
    key: 'gt',
    title: 'Itens NF > Negociado',
    dotColor: '#e5484d',
    trend: 'down',
    endpoint: '/entradas-fiscais/metrics/nf-maior-que-negociado',
    filter: { op: 'gt' }
  },
  {
    key: 'gt-le2',
    title: 'Itens NF > Negociado (até 2%)',
    dotColor: '#f5c518',
    trend: 'down',
    endpoint: '/entradas-fiscais/metrics/nf-maior-que-negociado',
    maxPercent: 2,
    filter: { op: 'gt', maxPercent: 2 }
  },
  {
    key: 'gt-gt2',
    title: 'Itens NF > Negociado (acima de 2%)',
    dotColor: '#c01d22',
    trend: 'down',
    endpoint: '/entradas-fiscais/metrics/nf-maior-que-negociado',
    minPercent: 2,
    filter: { op: 'gt', minPercent: 2 }
  }
]

export default function Overview2() {
  const [period, setPeriod] = useState(PERIOD_THIS_MONTH)
  const [customRange, setCustomRange] = useState(() => monthRange(0))
  const [selectedCard, setSelectedCard] = useState(null)
  const [codigoFilial, setCodigoFilial] = useState('')
  // Right-click em um card abre o modal de detalhes focado naquela categoria.
  const [detailsCtx, setDetailsCtx] = useState(null)

  const { data: filiais } = useApi('/filiais', { fallback: [] })
  const filiaisList = Array.isArray(filiais) ? filiais : []

  const activeRange = useMemo(() => {
    if (period === PERIOD_THIS_MONTH) return monthRange(0)
    if (period === PERIOD_LAST_MONTH) return monthRange(-1)
    return customRange
  }, [period, customRange])

  const selected = CARDS.find((c) => c.key === selectedCard) || null
  const totalBalanceFilter = selected
    ? { ...selected.filter, label: selected.title, color: selected.dotColor }
    : null

  const toggle = (key) => setSelectedCard((prev) => (prev === key ? null : key))

  const filialCodigo = codigoFilial || null

  return (
    <>
      <TopBar
        period={period}
        onPeriodChange={setPeriod}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        filiais={filiaisList}
        codigoFilial={codigoFilial}
        onCodigoFilialChange={setCodigoFilial}
      />

      <section className="grid row-nf">
        {CARDS.map((c) => (
          <NfVariationCard
            key={c.key}
            endpoint={c.endpoint}
            title={c.title}
            dotColor={c.dotColor}
            trend={c.trend}
            range={activeRange}
            maxPercent={c.maxPercent}
            minPercent={c.minPercent}
            codigoFilial={filialCodigo}
            selected={selectedCard === c.key}
            onClick={() => toggle(c.key)}
            onContextMenu={() => setDetailsCtx({
              range: activeRange,
              codigoFilial: filialCodigo,
              filter: { ...c.filter, label: c.title, color: c.dotColor }
            })}
          />
        ))}
      </section>

      <section className="grid row-2">
        <TotalBalance
          range={activeRange}
          filter={totalBalanceFilter}
          codigoFilial={filialCodigo}
        />
        <Performance />
      </section>

      <section className="grid row-grupos">
        <VariacaoPorGrupo
          range={activeRange}
          codigoFilial={filialCodigo}
          onCellClick={(grupo, scenarioKey) => {
            const filter = buildFilterForCell(grupo, scenarioKey)
            setDetailsCtx({
              range: activeRange,
              codigoFilial: filialCodigo,
              filter,
              grupoProdutoId: grupo ? (grupo.grupoId ?? 'null') : undefined
            })
          }}
        />
      </section>

      {detailsCtx && (
        <DayDetailsModal
          range={detailsCtx.range}
          codigoFilial={detailsCtx.codigoFilial}
          filter={detailsCtx.filter}
          grupoProdutoId={detailsCtx.grupoProdutoId}
          onClose={() => setDetailsCtx(null)}
        />
      )}
    </>
  )
}
