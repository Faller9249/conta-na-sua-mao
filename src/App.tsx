import type { Session } from '@supabase/supabase-js'
import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { db } from './data/db'
import { sincronizador } from './data/nuvem'
import { loginAtivo, useSessao } from './data/supabase'
import { Entrar, NovaSenha } from './paginas/Entrar'
import { Cartoes } from './paginas/Cartoes'
import { Casa } from './paginas/Casa'
import { Historico } from './paginas/Historico'
import { CriarCasa } from './paginas/CriarCasa'
import { Inicio } from './paginas/Inicio'
import { LancarGasto } from './paginas/LancarGasto'
import { Lista } from './paginas/Lista'
import { Metas } from './paginas/Metas'
import { Perfil } from './paginas/Perfil'
import { VincularCasa } from './paginas/VincularCasa'
import { TabBar } from './ui/componentes'

// O leitor de código de barras é pesado: só carrega ao abrir o Carrinho.
const Carrinho = lazy(() => import('./paginas/Carrinho').then((m) => ({ default: m.Carrinho })))
const DetalheCompra = lazy(() => import('./paginas/DetalheCompra').then((m) => ({ default: m.DetalheCompra })))

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
  return <AppDaCasa sessao={loginAtivo ? login.sessao : null} />
}

function AppDaCasa({ sessao }: { sessao: Session | null }) {
  // undefined = ainda carregando.
  const estado = useLiveQuery(async () => ({ casa: (await db.casa.get('casa')) ?? null, vinculo: (await db.meta.get('sync')) ?? null }))
  const casaId = sessao && estado?.vinculo?.userId === sessao.user.id ? estado.vinculo.casaId : null

  // Liga a sincronização quando o celular está numa casa da nuvem; desliga ao sair.
  useEffect(() => {
    if (casaId) sincronizador?.iniciar(casaId)
    else sincronizador?.parar()
  }, [casaId])

  if (estado === undefined) return null
  const { casa } = estado

  if (sessao && !casaId) {
    return (
      <HashRouter>
        <main className="app sem-tab">
          <VincularCasa sessao={sessao} />
        </main>
      </HashRouter>
    )
  }

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
          <Route path="/cartoes" element={<Cartoes />} />
          <Route path="/historico" element={<Historico />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/historico/:id" element={<Suspense fallback={<p className="vazio">Abrindo…</p>}><DetalheCompra /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TabBar />
      </main>
    </HashRouter>
  )
}
