import { useEffect, useRef, useState } from 'react'
import { LogIn, Loader2 } from 'lucide-react'
import { login } from '../api.js'

export default function LoginScreen({ onLogged }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const userRef = useRef(null)

  useEffect(() => { userRef.current?.focus() }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const data = await login(username.trim(), password)
      onLogged?.(data.user)
    } catch (err) {
      setError(err.message || 'Falha ao autenticar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="logo-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="20" height="20" fill="none">
              <path
                d="M17 33.5 L28 44 L47 21"
                stroke="#ffffff"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="logo-word">
            <span className="logo-word-1">Audit</span>
            <span className="logo-word-2">Supply</span>
          </span>
        </div>

        <h1 className="login-title">Entrar</h1>
        <p className="login-sub">Use suas credenciais para acessar a aplicação.</p>

        {error && <div className="banner">{error}</div>}

        <label htmlFor="login-user">Usuário</label>
        <input
          id="login-user"
          ref={userRef}
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          disabled={submitting}
        />

        <label htmlFor="login-pass">Senha</label>
        <input
          id="login-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={submitting}
        />

        <button type="submit" className="btn btn-primary login-btn" disabled={submitting}>
          {submitting ? <Loader2 size={14} className="spin" /> : <LogIn size={14} />}
          <span>{submitting ? 'Entrando…' : 'Entrar'}</span>
        </button>
      </form>
    </div>
  )
}
