import { Router } from 'express'
import { randomBytes } from 'node:crypto'

const router = Router()

// Sessão em memória — token aleatório com TTL.
//
// Para um app multi-instância isso precisaria virar Redis/JWT, mas
// como o app roda em uma única instância via systemd, um Set local
// é suficiente. Logout e expiração limpam o token.
const tokens = new Map() // token -> { username, expiresAt }

const ADMIN_USER = process.env.AUTH_USERNAME || 'admin'
const ADMIN_PASS = process.env.AUTH_PASSWORD || 'admin'
const TTL_MS = Number(process.env.AUTH_TTL_HOURS || 12) * 3600 * 1000

function issueToken(username) {
  const token = randomBytes(24).toString('hex')
  tokens.set(token, { username, expiresAt: Date.now() + TTL_MS })
  return token
}

function readBearer(req) {
  const auth = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(auth)
  return m?.[1] || null
}

// Middleware exportado para proteger as demais rotas em server/index.js.
// Libera /template.xlsx (modelos públicos sem dado sensível) para que
// possam ser baixados via <a href="..."> sem header auth.
export function requireAuth(req, res, next) {
  if (req.method === 'GET' && /\/template\.xlsx$/.test(req.path)) return next()
  const token = readBearer(req)
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  const entry = tokens.get(token)
  if (!entry || entry.expiresAt < Date.now()) {
    tokens.delete(token)
    return res.status(401).json({ error: 'token_expired' })
  }
  req.user = { username: entry.username }
  req.authToken = token
  next()
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  const u = typeof username === 'string' ? username.trim() : ''
  const p = typeof password === 'string' ? password : ''
  if (u !== ADMIN_USER || p !== ADMIN_PASS) {
    return res.status(401).json({
      error: 'invalid_credentials',
      message: 'Usuário ou senha inválidos'
    })
  }
  const token = issueToken(u)
  res.json({
    token,
    user: { username: u },
    expiresAt: tokens.get(token).expiresAt,
    ttlMs: TTL_MS
  })
})

router.post('/logout', (req, res) => {
  const token = readBearer(req)
  if (token) tokens.delete(token)
  res.status(204).end()
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// Limpeza periódica de tokens expirados (não bloqueia o evento loop).
setInterval(() => {
  const now = Date.now()
  for (const [t, e] of tokens) if (e.expiresAt < now) tokens.delete(t)
}, 5 * 60 * 1000).unref()

export default router
