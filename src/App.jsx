import { useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import Dashboard from './pages/Overview2.jsx'
import TiposEntradaSaida from './pages/TiposEntradaSaida.jsx'
import Produtos from './pages/Produtos.jsx'
import EntradasFiscais from './pages/EntradasFiscais.jsx'
import Filiais from './pages/Filiais.jsx'
import GruposProdutos from './pages/GruposProdutos.jsx'
import AprovacoesEntradasFiscais from './pages/AprovacoesEntradasFiscais.jsx'

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
  const Page = ROUTES[route] || Dashboard

  return (
    <div className="app">
      <Sidebar route={route} onNavigate={setRoute} />
      <main className="main">
        <Page />
      </main>
    </div>
  )
}
