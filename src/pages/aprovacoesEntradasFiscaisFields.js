// Centraliza os 11 campos de Aprovações de Entradas Fiscais — usado pela
// tabela, pelo form e pelo modal de import.
export const FIELDS = [
  // Aprovador
  { name: 'codigoAprovador',          label: 'Código do aprovador',             kind: 'string',  section: 'Aprovador', maxLen: 50,  required: true,  w: 130 },
  { name: 'nomeAprovador',            label: 'Nome do aprovador',               kind: 'string',  section: 'Aprovador', maxLen: 200, w: 220 },

  // Documento
  { name: 'codigoFilial',             label: 'Código da filial',                kind: 'string',  section: 'Documento', maxLen: 20,  required: true,  w: 100 },
  { name: 'codigoDocumento',          label: 'Código do documento',             kind: 'string',  section: 'Documento', maxLen: 20,  required: true,  w: 140 },
  { name: 'serieDocumento',           label: 'Série',                            kind: 'string',  section: 'Documento', maxLen: 10,  w: 70 },
  { name: 'dataEmissaoDocumento',     label: 'Data de emissão',                  kind: 'date',    section: 'Documento', w: 120 },
  { name: 'dataEscrituracaoDocumento', label: 'Data da escrituração',            kind: 'date',    section: 'Documento', w: 130 },
  { name: 'valorTotalDocumento',      label: 'Valor total do documento aprovado', kind: 'numeric', section: 'Documento', w: 170, align: 'right', money: true },

  // Fornecedor e Pedido
  { name: 'codigoFornecedor',         label: 'Código do fornecedor',             kind: 'string',  section: 'Fornecedor e Pedido', maxLen: 50, w: 140 },
  { name: 'lojaFornecedor',           label: 'Loja do fornecedor',               kind: 'string',  section: 'Fornecedor e Pedido', maxLen: 20, w: 90 },
  { name: 'codigoPedidoCompras',      label: 'Código do pedido de compras',      kind: 'string',  section: 'Fornecedor e Pedido', maxLen: 30, w: 160 }
]

export const SECTIONS = Array.from(new Set(FIELDS.map(f => f.section)))

export function formatValue(f, v) {
  if (v === null || v === undefined || v === '') return ''
  if (f.kind === 'numeric') {
    const n = Number(v)
    if (!Number.isFinite(n)) return String(v)
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: f.money ? 2 : 0,
      maximumFractionDigits: f.money ? 2 : 4
    }).format(n)
  }
  if (f.kind === 'date') {
    const s = String(v).slice(0, 10)
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s
  }
  return String(v)
}
