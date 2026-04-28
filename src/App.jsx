import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import Dashboard from './pages/Overview2.jsx'
import TiposEntradaSaida from './pages/TiposEntradaSaida.jsx'
import Produtos from './pages/Produtos.jsx'
import EntradasFiscais from './pages/EntradasFiscais.jsx'
import Filiais from './pages/Filiais.jsx'
import GruposProdutos from './pages/GruposProdutos.jsx'
import AprovacoesEntradasFiscais from './pages/AprovacoesEntradasFiscais.jsx'
import { getToken, fetchMe, logout as apiLogout } from './api.js'

const ROUTES = {
  'dashboard':                     Dashboard,
  'entradas-fiscais':              EntradasFiscais,
  'tipos-entrada-saida':           TiposEntradaSaida,
  'produtos':                      Produtos,
  'grupos-produtos':               GruposProdutos,
  'filiais':                       Filiais,
  'aprovacoes-entradas-fiscais':   AprovacoesEntradasFiscais
}

export default function App() {
  const [route, setRoute] = useState('dashboard')
  const [user, setUser] = useState(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  // Validar token salvo no localStorage ao carregar a app — se o token
  // expirou ou foi revogado, /auth/me retorna 401 e voltamos ao login.
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!getToken()) {
        setBootstrapping(false)
        return
      }
      try {
        const data = await fetchMe()
        if (!cancelled) setUser(data.user)
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  // Reagir a 401 vindos de qualquer chamada (token expirou no meio do uso).
  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  async function handleLogout() {
    await apiLogout()
    setUser(null)
  }

  if (bootstrapping) return null

  if (!user) return <LoginScreen onLogged={(u) => setUser(u)} />

  const Page = ROUTES[route] || Dashboard
  return (
    <div className="app">
      <Sidebar
        route={route}
        onNavigate={setRoute}
        user={user}
        onLogout={handleLogout}
      />
      <main className="main">
        <Page />
      </main>
    </div>
  )
}
