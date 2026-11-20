import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../data/db'
import { definirReservaPct, separarReserva } from '../data/repo'
import { loginAtivo, sair, useSessao } from '../data/supabase'
import { brl, hojeISO, lerValor, mesDe, metaReserva, separadoNoMes } from '../domain/regras'
import { Barra, Cabecalho } from '../ui/componentes'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const nomeMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]} de ${aaaamm.slice(0, 4)}`

export function Metas() {
  const dados = useLiveQuery(async () => ({
    casa: await db.casa.get('casa'),
    pessoas: await db.pessoas.toArray(),
    reservas: await db.reservas.toArray(),
  }))
  const [outra, setOutra] = useState('')
  const [editando, setEditando] = useState(false)
  if (!dados?.casa) return null
  const { casa, pessoas, reservas } = dados
  const mes = mesDe(hojeISO())
  const entradas = pessoas.reduce((s, p) => s + p.entradaMensal, 0)
  const meta = metaReserva(entradas, casa.reservaPct)
  const separado = separadoNoMes(reservas, mes)
  const falta = Math.max(0, meta - separado)
  const porMes = [...new Set(reservas.map((r) => r.mes))].sort().reverse()
  const totalGuardado = reservas.reduce((s, r) => s + r.valor, 0)

  return (
    <div className="conteudo">
      <Cabecalho titulo="Metas e reserva" sub="Quanto guardar de cada entrada" />

      <section className="cartao">
        <p className="pequeno">Reserva do mês</p>
        <div className="chips">
          {[5, 10, 15].map((v) => (
            <button key={v} className={`chip${casa.reservaPct === v ? ' ativo' : ''}`} onClick={() => definirReservaPct(db, v)}>{v}%</button>
          ))}
          <button className={`chip${![5, 10, 15].includes(casa.reservaPct) ? ' ativo' : ''}`} onClick={() => setEditando((e) => !e)}>
            {![5, 10, 15].includes(casa.reservaPct) ? `${casa.reservaPct}%` : 'Outra'}
          </button>
        </div>
        {editando && (
          <form className="linha" onSubmit={(e) => { e.preventDefault(); const v = Number(outra.replace(',', '.')); if (v > 0 && v <= 100) { definirReservaPct(db, v); setEditando(false) } }}>
            <input className="entrada cresce" inputMode="decimal" value={outra} onChange={(e) => setOutra(e.target.value)} placeholder="%" aria-label="Porcentagem" />
            <button className="botao" style={{ width: 'auto' }}>OK</button>
          </form>
        )}
        <strong>{casa.reservaPct}% de {brl(entradas)} = {brl(meta)} por mês</strong>
      </section>

      <section className="cartao" style={{ gap: 8 }}>
        <div className="linha entre">
          <h2>Separado em {MESES[new Date().getMonth()].toLowerCase()}</h2>
          <span className="pequeno">{brl(separado)} / {brl(meta)}</span>
        </div>
        <Barra uso={meta ? separado / meta : 0} />
        <p className="pequeno">{falta > 0 ? `Faltam ${brl(falta)}.` : 'Meta do mês cumprida.'}</p>
      </section>

      {falta > 0 && <button className="botao" onClick={() => separarReserva(db, falta)}>Marcar {brl(falta)} como separado</button>}
      <SepararOutroValor />

      <section className="cartao">
        <div className="linha entre">
          <h2>Guardado no total</h2>
          <strong style={{ color: 'var(--verde)', fontSize: 18 }}>{brl(totalGuardado)}</strong>
        </div>
        {porMes.length === 0 && <p className="pequeno">Nada separado ainda.</p>}
        {porMes.map((m) => {
          const v = separadoNoMes(reservas, m)
          return (
            <div key={m} className="linha entre">
              <span>{nomeMes(m)}</span>
              <span style={{ color: m === mes && v < meta ? 'var(--alerta)' : 'var(--verde)', fontWeight: 500 }}>{brl(v)}</span>
            </div>
          )
        })}
      </section>
      <p className="pequeno" style={{ textAlign: 'center' }}>A transferência é feita no app do seu banco. O app só calcula e lembra.</p>
      <Conta />
    </div>
  )
}

function Conta() {
  const login = useSessao()
  if (!loginAtivo || login.carregando || !login.sessao) return null
  return (
    <section className="cartao">
      <div className="linha entre">
        <div className="cresce">
          <p className="pequeno">Conectado como</p>
          <strong style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{login.sessao.user.email}</strong>
        </div>
        <button className="botao secundario" style={{ width: 'auto', padding: '10px 16px' }} onClick={() => sair()}>Sair</button>
      </div>
    </section>
  )
}

function SepararOutroValor() {
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState('')
  const c = lerValor(valor)
  if (!aberto) return <button className="botao texto" onClick={() => setAberto(true)}>Separar outro valor</button>
  return (
    <form className="linha" onSubmit={async (e) => { e.preventDefault(); if (c) { await separarReserva(db, c); setValor(''); setAberto(false) } }}>
      <input className="entrada cresce" autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="R$ 0,00" aria-label="Valor separado" />
      <button className="botao" style={{ width: 'auto' }} disabled={!c}>Separar</button>
    </form>
  )
}
