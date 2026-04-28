import { useEffect, useState } from 'react'

const BASE = import.meta.env.VITE_API_BASE || '/api'
const TOKEN_KEY = 'audit-supply.token'

// ---------- Token storage ----------

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null } catch { return null }
}
export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else   localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

// Headers para qualquer chamada autenticada — inclui o Bearer se há token.
// Útil quando o consumidor faz fetch() direto (uploads de FormData, etc.).
export function authHeaders(extra = {}) {
  const t = getToken()
  return t ? { ...extra, Authorization: `Bearer ${t}` } : { ...extra }
}

// Eventos globais para reagir ao logout/timeout — App escuta para
// devolver ao login quando o backend retornar 401.
function broadcast(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })) } catch {}
}
function handleUnauthorized(path) {
  setToken(null)
  broadcast('auth:unauthorized', { path })
}

// ---------- Helpers ----------

async function parseError(res, path) {
  const body = await res.text().catch(() => '')
  let msg = body
  let payload = null
  try { payload = JSON.parse(body) } catch {}
  if (payload) {
    msg = payload.message || payload.error || body
  }
  if (!payload && /ECONNREFUSED|AggregateError|socket hang up/i.test(body)) {
    msg = 'API indisponível. Verifique se o servidor em :3001 está rodando (npm run dev:api).'
  }
  const err = new Error(msg || `HTTP ${res.status}`)
  err.status = res.status
  err.path = path
  if (payload?.fields) err.fields = payload.fields
  return err
}

export async function apiGet(path, { signal } = {}) {
  const res = await fetch(`${BASE}${path}`, { signal, headers: authHeaders() })
  if (res.status === 401) {
    handleUnauthorized(path)
    throw await parseError(res, path)
  }
  if (!res.ok) throw await parseError(res, path)
  return res.json()
}

export async function apiSend(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: body != null ? JSON.stringify(body) : undefined
  })
  if (res.status === 401) {
    handleUnauthorized(path)
    throw await parseError(res, path)
  }
  if (res.status === 204) return null
  if (!res.ok) throw await parseError(res, path)
  return res.json()
}

export function useApi(path, { fallback = null } = {}) {
  const [data, setData] = useState(fallback)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    apiGet(path, { signal: ctrl.signal })
      .then((d) => { setData(d); setError(null) })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          console.warn('[api]', e.message)
          setError(e)
        }
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [path])

  return { data, error, loading }
}

// ---------- Auth API ----------

export async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (!res.ok) throw await parseError(res, '/auth/login')
  const data = await res.json()
  setToken(data.token)
  broadcast('auth:login', { user: data.user })
  return data
}

export async function logout() {
  const t = getToken()
  if (t) {
    try {
      await fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` }
      })
    } catch {}
  }
  setToken(null)
  broadcast('auth:logout', null)
}

export async function fetchMe() {
  return apiGet('/auth/me')
}
