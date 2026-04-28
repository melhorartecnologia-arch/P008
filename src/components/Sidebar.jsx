import { useState } from 'react'
import {
  LayoutDashboard, LogOut,
  FolderOpen, ChevronDown, ChevronRight,
  ArrowRightLeft, ShoppingBag, Receipt, Building2, Layers, FileCheck2
} from 'lucide-react'

const primary = [
  { icon: LayoutDashboard, label: 'Dashboard',        route: 'dashboard' },
  { icon: Receipt,         label: 'Entradas Fiscais', route: 'entradas-fiscais' }
]

const cadastros = [
  { icon: ArrowRightLeft, label: 'Tipo de Entrada e Saída',         route: 'tipos-entrada-saida' },
  { icon: ShoppingBag,    label: 'Produtos',                         route: 'produtos' },
  { icon: Layers,         label: 'Grupo de Produtos',                route: 'grupos-produtos' },
  { icon: Building2,      label: 'Filiais',                          route: 'filiais' },
  { icon: FileCheck2,     label: 'Aprovações de Entradas Fiscais',   route: 'aprovacoes-entradas-fiscais' }
]

export default function Sidebar({ route, onNavigate, user, onLogout }) {
  const username = user?.username || 'admin'
  const initial = username.charAt(0).toUpperCase()
  const cadastrosActive = cadastros.some(c => c.route === route)
  const [openCadastros, setOpenCadastros] = useState(cadastrosActive)

  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="logo-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="18" height="18" fill="none">
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

      <nav className="nav">
        {primary.map((item) => {
          const active = item.route && item.route === route
          return (
            <button
              key={item.label}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => item.route && onNavigate(item.route)}
            >
              <item.icon size={16} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.kbd && <span className="kbd">{item.kbd}</span>}
            </button>
          )
        })}

        <button
          className={`nav-item ${cadastrosActive ? 'active' : ''}`}
          onClick={() => setOpenCadastros((v) => !v)}
        >
          <FolderOpen size={16} strokeWidth={1.8} />
          <span>Cadastros</span>
          <span className="kbd" style={{ display: 'inline-flex' }}>
            {openCadastros ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>

        {openCadastros && (
          <div className="nav-subgroup">
            {cadastros.map((item) => (
              <button
                key={item.label}
                className={`nav-item sub ${item.route === route ? 'active' : ''}`}
                onClick={() => onNavigate(item.route)}
              >
                <item.icon size={14} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="profile">
        <div className="profile-avatar">{initial}</div>
        <div className="profile-info">
          <span className="name">{username}</span>
          <span className="mail">Sessão ativa</span>
        </div>
        <button
          className="profile-more"
          aria-label="Sair"
          title="Sair"
          onClick={onLogout}
        >
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  )
}
