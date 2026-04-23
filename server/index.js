import express from 'express'
import cors from 'cors'
import 'dotenv/config'

import { pool } from './db.js'
import { ensureSchema } from './bootstrap.js'
import stats from './routes/stats.js'
import totalBalance from './routes/totalBalance.js'
import performance from './routes/performance.js'
import spentAmount from './routes/spentAmount.js'
import spending from './routes/spending.js'
import revenue from './routes/revenue.js'
import tiposEntradaSaida from './routes/tiposEntradaSaida.js'
import produtos from './routes/produtos.js'
import entradasFiscais from './routes/entradasFiscais.js'
import filiais from './routes/filiais.js'
import gruposProdutos from './routes/gruposProdutos.js'
import aprovacoesEntradasFiscais from './routes/aprovacoesEntradasFiscais.js'

const app = express()
const PORT = Number(process.env.PORT || 3001)

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))
app.use(express.json())

app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT 1 AS ok')
    res.json({ ok: rows[0]?.ok === 1 })
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message })
  }
})

app.use('/api/stats', stats)
app.use('/api/total-balance', totalBalance)
app.use('/api/performance', performance)
app.use('/api/spent-amount', spentAmount)
app.use('/api/spending', spending)
app.use('/api/revenue', revenue)
app.use('/api/tipos-entrada-saida', tiposEntradaSaida)
app.use('/api/produtos', produtos)
app.use('/api/entradas-fiscais', entradasFiscais)
app.use('/api/filiais', filiais)
app.use('/api/grupos-produtos', gruposProdutos)
app.use('/api/aprovacoes-entradas-fiscais', aprovacoesEntradasFiscais)

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path })
})

app.use((err, _req, res, _next) => {
  console.error('[api]', err)
  res.status(500).json({ error: 'internal_error', message: err.message })
})

async function start() {
  try {
    await ensureSchema()
  } catch (err) {
    console.error('✗ could not ensure schema:', err.message)
    console.error('  API will still start; DB-backed routes will return 500')
    console.error('  Fix the DB connection/permissions and restart.')
  }

  const server = app.listen(PORT, () => {
    console.log(`▲ Audit Supply API on http://localhost:${PORT}`)
  })

  async function shutdown(signal) {
    console.log(`\n${signal} received — shutting down`)
    server.close(() => { /* stop accepting */ })
    try { await pool.end() } catch {}
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start()
