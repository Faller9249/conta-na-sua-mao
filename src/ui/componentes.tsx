import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const ICONES = {
  inicio: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  lista: (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11" />
      <circle cx="4.5" cy="18" r="1" />
    </>
  ),
  carrinho: <path d="M4 5v14M8 5v14M11 5v14M15 5v14M18 5v14M21 5v14" />,
  casa: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M12 3v18M9.5 11v2M14.5 11v2" />
    </>
  ),
  metas: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
}

export function Icone({ nome, cor = 'currentColor', tamanho = 24, traco = 2 }: { nome: keyof typeof ICONES; cor?: string; tamanho?: number; traco?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES[nome]}
    </svg>
  )
}

export function TabBar() {
  const aba = (para: string, nome: keyof typeof ICONES, rotulo: string) => (
    <NavLink to={para} end className={({ isActive }) => `tab${isActive ? ' ativa' : ''}`}>
      <Icone nome={nome} />
      {rotulo}
    </NavLink>
  )
  return (
    <nav className="tabbar" aria-label="Menu principal">
      {aba('/', 'inicio', 'Início')}
      {aba('/lista', 'lista', 'Lista')}
      <NavLink to="/carrinho" className={({ isActive }) => `tab${isActive ? ' ativa' : ''}`}>
        <span className="bolha">
          <Icone nome="carrinho" cor="#fff" />
        </span>
        Carrinho
      </NavLink>
      {aba('/casa', 'casa', 'Casa')}
      {aba('/metas', 'metas', 'Metas')}
    </nav>
  )
}

export function Cabecalho({ titulo, sub, acao }: { titulo: string; sub?: ReactNode; acao?: ReactNode }) {
  return (
    <header className={acao ? 'com-acao' : undefined}>
      <div>
        <h1>{titulo}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {acao}
    </header>
  )
}

export function Barra({ uso, cor }: { uso: number; cor?: string }) {
  const pct = Math.max(0, Math.min(1, uso)) * 100
  return (
    <div className="barra" role="progressbar" aria-valuenow={Math.round(uso * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%`, background: cor }} />
    </div>
  )
}

/** Cor da barra conforme o uso do limite: verde, laranja a partir de 80%, vermelho acima de 100%. */
export function corDoUso(uso: number) {
  return uso > 1 ? 'var(--erro)' : uso >= 0.8 ? 'var(--alerta)' : 'var(--verde)'
}

export function Check({ ok, onClick, rotulo }: { ok: boolean; onClick?: () => void; rotulo: string }) {
  return (
    <button type="button" className={`check${ok ? ' ok' : ''}`} onClick={onClick} aria-label={rotulo} aria-pressed={ok}>
      {ok && <Icone nome="check" cor="#fff" tamanho={14} traco={3} />}
    </button>
  )
}
