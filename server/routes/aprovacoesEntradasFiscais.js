import { Router } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { query, pool } from '../db.js'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 }
})

/**
 * Campos do registro.
 *   camel      — nome no payload JSON
 *   db         — nome da coluna no Postgres
 *   kind       — string | numeric | date
 *   required   — validação obrigatória no POST/PUT
 *   maxLen     — para strings
 *   aliases    — nomes extras aceitos no cabeçalho do Excel (normalizados)
 */
const FIELDS = [
  { camel: 'codigoAprovador',          db: 'codigo_aprovador',           kind: 'string',  required: true,  maxLen: 50,
    aliases: ['codigoaprovador', 'codigodoaprovador', 'codaprovador', 'matriculaaprovador'] },
  { camel: 'nomeAprovador',            db: 'nome_aprovador',             kind: 'string',  maxLen: 200,
    aliases: ['nomeaprovador', 'nomedoaprovador', 'aprovador'] },
  { camel: 'codigoFilial',             db: 'codigo_filial',              kind: 'string',  required: true,  maxLen: 20,
    aliases: ['codigofilial', 'filial', 'codfilial'] },
  { camel: 'valorTotalDocumento',      db: 'valor_total_documento',      kind: 'numeric',
    aliases: ['valortotaldocumento', 'valortotaldodocumento', 'valortotaldocumentoaprovado',
              'valordocumento', 'valortotal'] },
  { camel: 'dataEmissaoDocumento',     db: 'data_emissao_documento',     kind: 'date',
    aliases: ['dataemissaodocumento', 'dataemissaododocumento', 'dataemissao', 'emissao'] },
  { camel: 'dataEscrituracaoDocumento', db: 'data_escrituracao_documento', kind: 'date',
    aliases: ['dataescrituracaodocumento', 'dataescrituracaododocumento',
              'dataescrituracao', 'escrituracao', 'dataescritoracaododocumento'] },
  { camel: 'codigoDocumento',          db: 'codigo_documento',           kind: 'string',  required: true,  maxLen: 20,
    aliases: ['codigodocumento', 'coddocumento', 'numerodocumento', 'numerodocumentofiscal',
              'numeronf', 'nf'] },
  { camel: 'serieDocumento',           db: 'serie_documento',            kind: 'string',  maxLen: 10,
    aliases: ['seriedocumento', 'seriedodocumento', 'serienf', 'serie'] },
  { camel: 'codigoFornecedor',         db: 'codigo_fornecedor',          kind: 'string',  maxLen: 50,
    aliases: ['codigofornecedor', 'codigodofornecedor', 'codfornecedor', 'fornecedor'] },
  { camel: 'lojaFornecedor',           db: 'loja_fornecedor',            kind: 'string',  maxLen: 20,
    aliases: ['lojafornecedor', 'lojadofornecedor', 'loja'] },
  { camel: 'codigoPedidoCompras',      db: 'codigo_pedido_compras',      kind: 'string',  maxLen: 30,
    aliases: ['codigopedidocompras', 'codigodopedidodecompras', 'numeropedidocompras',
              'numeropedidodecompras', 'pedidocompras', 'pedido'] }
]

const DB_COLS = FIELDS.map(f => f.db).join(', ')

function normalizeKey(k) {
  return String(k ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function matchHeader(normalized) {
  for (const f of FIELDS) {
    if (normalized === normalizeKey(f.camel)) return f.camel
    if (normalized === f.db.replace(/_/g, '')) return f.camel
    if (f.aliases?.includes(normalized)) return f.camel
  }
  return null
}

function mapRowDbToApi(row) {
  const out = { id: row.id }
  for (const f of FIELDS) {
    let v = row[f.db]
    if (v !== null && v !== undefined) {
      if (f.kind === 'numeric') v = Number(v)
      else if (f.kind === 'date' && v instanceof Date) v = v.toISOString().slice(0, 10)
    }
    out[f.camel] = v ?? null
  }
  out.createdAt = row.created_at
  out.updatedAt = row.updated_at
  return out
}

function parseScalar(kind, raw) {
  if (raw === undefined || raw === null || raw === '') return null
  if (kind === 'numeric') {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
    const s = String(raw).trim()
    if (!s) return null
    let n
    if (/,/.test(s) && /\./.test(s)) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) n = Number(s.replace(/\./g, '').replace(',', '.'))
      else n = Number(s.replace(/,/g, ''))
    } else if (/,/.test(s)) {
      n = Number(s.replace(/\./g, '').replace(',', '.'))
    } else {
      n = Number(s)
    }
    return Number.isFinite(n) ? n : NaN
  }
  if (kind === 'date') {
    if (raw instanceof Date && !isNaN(raw)) return raw.toISOString().slice(0, 10)
    const s = String(raw).trim()
    if (!s) return null
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
    if (br) return `${br[3]}-${br[2]}-${br[1]}`
    const ymd = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
    if (ymd) {
      const [, y, m, d] = ymd
      if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return `${y}-${m}-${d}`
    }
    const dmy = /^(\d{2})(\d{2})(\d{4})$/.exec(s)
    if (dmy) {
      const [, d, m, y] = dmy
      if (+m >= 1 && +m <= 12 && +d >= 1 && +d <= 31) return `${y}-${m}-${d}`
    }
    const n = Number(s)
    if (Number.isFinite(n) && n > 20000 && n < 80000) {
      const dd = XLSX.SSF.parse_date_code(n)
      if (dd) return `${dd.y}-${String(dd.m).padStart(2, '0')}-${String(dd.d).padStart(2, '0')}`
    }
    return NaN
  }
  return String(raw).trim()
}

function validate(body) {
  const errors = {}
  const values = {}
  for (const f of FIELDS) {
    const raw = body?.[f.camel]
    const parsed = parseScalar(f.kind, raw)
    if (f.required) {
      const isEmpty = parsed === null || (typeof parsed === 'string' && !parsed)
      if (isEmpty) { errors[f.camel] = 'obrigatório'; continue }
    }
    if (Number.isNaN(parsed)) { errors[f.camel] = f.kind === 'date' ? 'data inválida' : 'valor inválido'; continue }
    if (typeof parsed === 'string' && f.maxLen && parsed.length > f.maxLen) {
      errors[f.camel] = `máximo ${f.maxLen} caracteres`
      continue
    }
    values[f.camel] = parsed
  }
  return { errors, values }
}

function paramsFromValues(values) {
  return FIELDS.map(f => values[f.camel] ?? null)
}

const INSERT_SQL = (() => {
  const cols = FIELDS.map(f => f.db).join(', ')
  const ph = FIELDS.map((_, i) => `$${i + 1}`).join(', ')
  return `INSERT INTO aprovacoes_entradas_fiscais (${cols}) VALUES (${ph})
          RETURNING id, ${DB_COLS}, created_at, updated_at`
})()

// Bulk insert via unnest(): um array por coluna, qualquer tamanho de
// lote usa sempre 11 parâmetros (evita o limite de 65535 params do pg).
const BULK_INSERT_SQL = (() => {
  const cols = FIELDS.map(f => f.db).join(', ')
  const args = FIELDS.map((f, i) => {
    const t = f.kind === 'numeric' ? 'numeric'
            : f.kind === 'date'    ? 'date'
            : 'varchar'
    return `$${i + 1}::${t}[]`
  }).join(', ')
  return `INSERT INTO aprovacoes_entradas_fiscais (${cols})
          SELECT * FROM unnest(${args})`
})()

const IMPORT_BATCH_SIZE = 5000
const IMPORT_MAX_ROWS   = 500_000

const UPDATE_SQL = (() => {
  const sets = FIELDS.map((f, i) => `${f.db} = $${i + 1}`).join(', ')
  return `UPDATE aprovacoes_entradas_fiscais
          SET ${sets}, updated_at = NOW()
          WHERE id = $${FIELDS.length + 1}
          RETURNING id, ${DB_COLS}, created_at, updated_at`
})()

function readRange(req) {
  const q = req.query || {}
  const from = q.from ? String(q.from).slice(0, 10) : null
  const to   = q.to   ? String(q.to).slice(0, 10)   : null
  const codigoFilial = q.codigoFilial ? String(q.codigoFilial).trim() : null
  return { from, to, codigoFilial }
}

// MÉTRICAS: sumário de aprovações e variação das entradas fiscais
// relacionadas, agrupado por aprovador (comprador).
// Aceita ?from=YYYY-MM-DD&to=YYYY-MM-DD&codigoFilial=...
// O período é aplicado sobre a data_emissao_documento das aprovações.
// O vínculo com entradas_fiscais é feito por filial + número do
// documento + série (série NULL/vazia casa com NULL/vazio).
router.get('/metrics/por-aprovador', async (req, res, next) => {
  try {
    const { from, to, codigoFilial } = readRange(req)

    const params = []
    const whereAef = []
    const whereEntry = []
    if (codigoFilial) {
      params.push(codigoFilial)
      whereAef.push(`codigo_filial = $${params.length}`)
      whereEntry.push(`aef.codigo_filial = $${params.length}`)
    }
    if (from) {
      params.push(from)
      whereAef.push(`data_emissao_documento >= $${params.length}`)
      whereEntry.push(`aef.data_emissao_documento >= $${params.length}`)
    }
    if (to) {
      params.push(to)
      whereAef.push(`data_emissao_documento <= $${params.length}`)
      whereEntry.push(`aef.data_emissao_documento <= $${params.length}`)
    }
    if (from || to) {
      whereAef.push(`data_emissao_documento IS NOT NULL`)
      whereEntry.push(`aef.data_emissao_documento IS NOT NULL`)
    }

    const whereAefSql = whereAef.length ? `WHERE ${whereAef.join(' AND ')}` : ''
    const whereEntrySql = whereEntry.length ? `AND ${whereEntry.join(' AND ')}` : ''

    const sql = `
      WITH approvals AS (
        SELECT
          codigo_aprovador,
          MAX(nome_aprovador)                   AS nome_aprovador,
          COUNT(*)::int                         AS docs_aprovados,
          COALESCE(SUM(valor_total_documento), 0)::numeric AS valor_aprovado_total
        FROM aprovacoes_entradas_fiscais
        ${whereAefSql}
        GROUP BY codigo_aprovador
      ),
      entries AS (
        SELECT
          aef.codigo_aprovador,
          COUNT(ef.id)::int AS itens_fiscais,
          COALESCE(SUM(CASE
            WHEN ef.valor_nota_fiscal < ef.valor_negociado_compras
            THEN ef.quantidade_escriturada * (ef.valor_negociado_compras - ef.valor_nota_fiscal)
            ELSE 0 END), 0)::numeric AS savings,
          COALESCE(SUM(CASE
            WHEN ef.valor_nota_fiscal > ef.valor_negociado_compras
            THEN ef.quantidade_escriturada * (ef.valor_nota_fiscal - ef.valor_negociado_compras)
            ELSE 0 END), 0)::numeric AS overspend,
          COALESCE(SUM(ef.quantidade_escriturada * ef.valor_negociado_compras), 0)::numeric AS valor_base,
          COUNT(*) FILTER (
            WHERE ef.valor_nota_fiscal < ef.valor_negociado_compras
          )::int AS lt_count,
          COUNT(*) FILTER (
            WHERE ef.valor_nota_fiscal > ef.valor_negociado_compras
          )::int AS gt_count
        FROM aprovacoes_entradas_fiscais aef
        INNER JOIN entradas_fiscais ef
          ON ef.codigo_filial = aef.codigo_filial
         AND ef.numero_documento_fiscal = aef.codigo_documento
         AND COALESCE(ef.serie_documento_fiscal, '') = COALESCE(aef.serie_documento, '')
        WHERE ef.codigo_tipo_entrada IN (
                SELECT codigo FROM tipos_entrada_saida WHERE considera_analise = TRUE
              )
          AND ef.valor_nota_fiscal IS NOT NULL
          AND ef.valor_negociado_compras IS NOT NULL
          AND ef.quantidade_escriturada IS NOT NULL
          ${whereEntrySql}
        GROUP BY aef.codigo_aprovador
      )
      SELECT
        a.codigo_aprovador,
        a.nome_aprovador,
        a.docs_aprovados,
        a.valor_aprovado_total,
        COALESCE(e.itens_fiscais, 0) AS itens_fiscais,
        COALESCE(e.savings, 0)       AS savings,
        COALESCE(e.overspend, 0)     AS overspend,
        COALESCE(e.valor_base, 0)    AS valor_base,
        COALESCE(e.lt_count, 0)      AS lt_count,
        COALESCE(e.gt_count, 0)      AS gt_count
      FROM approvals a
      LEFT JOIN entries e USING (codigo_aprovador)
      ORDER BY a.valor_aprovado_total DESC NULLS LAST, a.codigo_aprovador ASC
    `

    const { rows } = await query(sql, params)
    const out = rows.map((r) => {
      const savings   = Number(r.savings)
      const overspend = Number(r.overspend)
      const base      = Number(r.valor_base)
      const net       = savings - overspend
      const pct       = base > 0 ? (net / base) * 100 : null
      return {
        codigoAprovador:      r.codigo_aprovador,
        nomeAprovador:        r.nome_aprovador,
        docsAprovados:        Number(r.docs_aprovados),
        valorAprovadoTotal:   Number(r.valor_aprovado_total),
        itensFiscais:         Number(r.itens_fiscais),
        ltCount:              Number(r.lt_count),
        gtCount:              Number(r.gt_count),
        savings,
        overspend,
        net,
        valorBase:            base,
        variacaoPercentual:   pct
      }
    })

    // Totais gerais (linha de rodapé no frontend)
    const totals = out.reduce((acc, r) => {
      acc.docsAprovados      += r.docsAprovados
      acc.valorAprovadoTotal += r.valorAprovadoTotal
      acc.itensFiscais       += r.itensFiscais
      acc.savings            += r.savings
      acc.overspend          += r.overspend
      acc.valorBase          += r.valorBase
      return acc
    }, {
      docsAprovados: 0, valorAprovadoTotal: 0, itensFiscais: 0,
      savings: 0, overspend: 0, valorBase: 0
    })
    totals.net = totals.savings - totals.overspend
    totals.variacaoPercentual = totals.valorBase > 0
      ? (totals.net / totals.valorBase) * 100
      : null

    res.json({ rows: out, totals })
  } catch (err) { next(err) }
})

// LIST
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim()
    const params = []
    let where = ''
    if (q) {
      params.push(`%${q}%`)
      where = `WHERE codigo_aprovador ILIKE $1
               OR nome_aprovador ILIKE $1
               OR codigo_filial ILIKE $1
               OR codigo_documento ILIKE $1
               OR codigo_fornecedor ILIKE $1
               OR codigo_pedido_compras ILIKE $1`
    }
    const { rows } = await query(
      `SELECT id, ${DB_COLS}, created_at, updated_at
         FROM aprovacoes_entradas_fiscais
         ${where}
         ORDER BY id DESC`,
      params
    )
    res.json(rows.map(mapRowDbToApi))
  } catch (err) { next(err) }
})

// TEMPLATE
router.get('/template.xlsx', (_req, res, next) => {
  try {
    const header = FIELDS.map(f => f.camel)
    const example = [
      'APR001', 'Maria da Silva', '001', '12345.67',
      '2026-04-12', '2026-04-15', '000123456', '1', 'FRN0042', '01', 'PC00045678'
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([header, example])
    ws['!cols'] = header.map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(wb, ws, 'Aprovacoes')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition',
      'attachment; filename="aprovacoes_entradas_fiscais_modelo.xlsx"')
    res.send(buf)
  } catch (err) { next(err) }
})

// IMPORT
router.post('/import', (req, res, next) => {
  upload.single('file')(req, res, async (uerr) => {
    if (uerr) {
      if (uerr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'file_too_large', message: 'Arquivo excede 100MB' })
      }
      return res.status(400).json({ error: 'upload_error', message: uerr.message })
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'no_file', message: 'Envie um arquivo .xlsx no campo "file"' })
      }

      let wb
      try { wb = XLSX.read(req.file.buffer, { type: 'buffer' }) }
      catch { return res.status(400).json({ error: 'invalid_file', message: 'Arquivo inválido ou corrompido' }) }

      const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) return res.status(400).json({ error: 'empty_file' })
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

      if (raw.length > IMPORT_MAX_ROWS) {
        return res.status(413).json({
          error: 'too_many_rows',
          message: `Limite de ${IMPORT_MAX_ROWS.toLocaleString('pt-BR')} linhas (recebido ${raw.length.toLocaleString('pt-BR')})`
        })
      }

      const errors = []
      const valid = []

      raw.forEach((rowRaw, i) => {
        const rowNum = i + 2
        const payload = {}
        for (const [k, v] of Object.entries(rowRaw)) {
          const field = matchHeader(normalizeKey(k))
          if (field) payload[field] = v
        }
        const allEmpty = FIELDS.every(f => {
          const v = payload[f.camel]
          return v === undefined || v === null || v === ''
        })
        if (allEmpty) return

        const { errors: rowErrors, values } = validate(payload)
        const msgs = Object.entries(rowErrors).map(([k, m]) => `${k}: ${m}`)
        if (msgs.length) {
          errors.push({
            row: rowNum,
            codigo: payload.codigoAprovador || '',
            messages: msgs
          })
          return
        }
        valid.push(values)
      })

      if (errors.length && valid.length === 0) {
        return res.status(422).json({
          error: 'validation_error',
          totalRows: raw.length,
          inserted: 0, updated: 0, skipped: 0,
          errors
        })
      }

      const batches = Math.ceil(valid.length / IMPORT_BATCH_SIZE)
      const startedAt = Date.now()
      const client = await pool.connect()
      let inserted = 0
      try {
        await client.query('BEGIN')
        for (let b = 0; b < batches; b++) {
          const chunk = valid.slice(b * IMPORT_BATCH_SIZE, (b + 1) * IMPORT_BATCH_SIZE)
          const columnArrays = FIELDS.map(f => chunk.map(v => v[f.camel] ?? null))
          await client.query(BULK_INSERT_SQL, columnArrays)
          inserted += chunk.length
          if (b === 0 || (b + 1) % 5 === 0 || b === batches - 1) {
            console.log(`[import aprovacoes_entradas_fiscais] bloco ${b + 1}/${batches} · +${chunk.length} linhas (acum ${inserted})`)
          }
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        return next(e)
      } finally {
        client.release()
      }
      const elapsedMs = Date.now() - startedAt

      res.json({
        totalRows: raw.length,
        inserted,
        updated: 0,
        skipped: 0,
        batches,
        batchSize: IMPORT_BATCH_SIZE,
        elapsedMs,
        errors
      })
    } catch (err) { next(err) }
  })
})

// GET ONE
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid_id' })
    }
    const { rows } = await query(
      `SELECT id, ${DB_COLS}, created_at, updated_at
         FROM aprovacoes_entradas_fiscais
         WHERE id = $1`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ error: 'not_found' })
    res.json(mapRowDbToApi(rows[0]))
  } catch (err) { next(err) }
})

// CREATE
router.post('/', async (req, res, next) => {
  try {
    const { errors, values } = validate(req.body)
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'validation_error', fields: errors })
    }
    const { rows } = await query(INSERT_SQL, paramsFromValues(values))
    res.status(201).json(mapRowDbToApi(rows[0]))
  } catch (err) { next(err) }
})

// UPDATE
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid_id' })
    }
    const { errors, values } = validate(req.body)
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'validation_error', fields: errors })
    }
    const params = paramsFromValues(values)
    params.push(id)
    const { rows } = await query(UPDATE_SQL, params)
    if (!rows.length) return res.status(404).json({ error: 'not_found' })
    res.json(mapRowDbToApi(rows[0]))
  } catch (err) { next(err) }
})

// DELETE
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'invalid_id' })
    }
    const { rowCount } = await query(
      `DELETE FROM aprovacoes_entradas_fiscais WHERE id = $1`,
      [id]
    )
    if (!rowCount) return res.status(404).json({ error: 'not_found' })
    res.status(204).end()
  } catch (err) { next(err) }
})

export default router
