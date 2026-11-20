import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { db } from './data/db'
import { loginAtivo, useSessao } from './data/supabase'
import { Entrar, NovaSenha } from './paginas/Entrar'
import { Casa } from './paginas/Casa'
import { CriarCasa } from './paginas/CriarCasa'
import { Inicio } from './paginas/Inicio'
import { LancarGasto } from './paginas/LancarGasto'
import { Lista } from './paginas/Lista'
import { Metas } from './paginas/Metas'
import { TabBar } from './ui/componentes'

// O leitor de código de barras é pesado: só carrega ao abrir o Carrinho.
const Carrinho = lazy(() => import('./paginas/Carrinho').then((m) => ({ default: m.Carrinho })))

export default function App() {
  const login = useSessao()
  if (login.carregando) return null
  if (loginAtivo && !login.sessao) {
    return (
      <main className="app sem-tab">
        <Entrar />
      </main>
    )
  }
  if (login.recuperandoSenha) {
    return (
      <main className="app sem-tab">
        <NovaSenha aoConcluir={login.concluirRecuperacao} />
      </main>
    )
  }
  return <AppDaCasa />
}

function AppDaCasa() {
  // undefined = ainda carregando; null = casa não criada.
  const casa = useLiveQuery(async () => (await db.casa.get('casa')) ?? null)
  if (casa === undefined) return null

  if (!casa) {
    return (
      <HashRouter>
        <main className="app sem-tab">
          <Routes>
            <Route path="*" element={<CriarCasa />} />
          </Routes>
        </main>
      </HashRouter>
    )
  }

  return (
    <HashRouter>
      <main className="app">
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/lista" element={<Lista />} />
          <Route path="/carrinho" element={<Suspense fallback={<p className="vazio">Abrindo o carrinho…</p>}><Carrinho /></Suspense>} />
          <Route path="/casa" element={<Casa />} />
          <Route path="/metas" element={<Metas />} />
          <Route path="/lancar" element={<LancarGasto />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TabBar />
      </main>
    </HashRouter>
  )
}
