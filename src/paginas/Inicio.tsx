import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
import { nomeDoUsuario } from '../data/nuvem'
import { useSessao } from '../data/supabase'
import { brl, diasAteProximaEntrada, gastoPorCartao, hojeISO, mesDe, metaReserva, resumoDoMes, separadoNoMes } from '../domain/regras'
import { Barra, Cabecalho, corDoUso } from '../ui/componentes'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function Inicio() {
  const login = useSessao()
  const usuario = !login.carregando ? login.sessao?.user : undefined
  const dados = useLiveQuery(async () => ({
    casa: await db.casa.get('casa'),
    pessoas: await db.pessoas.toArray(),
    lancamentos: await db.lancamentos.toArray(),
    reservas: await db.reservas.toArray(),
    cartoes: await db.cartoes.toArray(),
  }))
  if (!dados?.casa) return null
  const { casa, pessoas, lancamentos, reservas, cartoes } = dados
  const hoje = new Date()
  const mes = mesDe(hojeISO(hoje))
  const r = resumoDoMes(mes, lancamentos, pessoas, casa.limites)
  const dias = diasAteProximaEntrada(pessoas, hoje)
  const meta = metaReserva(r.entradas, casa.reservaPct)
  const separado = separadoNoMes(reservas, mes)
  const nomes = pessoas.map((p) => p.nome).join(' e ')
  const porCartao = [...gastoPorCartao(lancamentos, mes).entries()]
    .map(([k, v]) => ({ nome: k === 'sem' ? 'Não informado' : (cartoes.find((c) => c.id === k)?.nome ?? 'Cartão removido'), valor: v }))
    .sort((a, b) => b.valor - a.valor)
  const diasRestantes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate() - hoje.getDate()

  return (
    <div className="conteudo">
      <Cabecalho
        titulo={nomes ? `Olá, ${nomes}` : casa.nome}
        acao={
          <Link to="/perfil" className="avatar" aria-label="Perfil e conta">
            {(nomeDoUsuario(usuario)[0] ?? '☰').toUpperCase()}
          </Link>
        }
        sub={`${MESES[hoje.getMonth()][0].toUpperCase()}${MESES[hoje.getMonth()].slice(1)} de ${hoje.getFullYear()}${dias !== null ? ` · ${dias === 0 ? 'dia de salário' : `faltam ${dias} dias para o salário`}` : ''}`}
      />

      <section className="cartao" style={{ gap: 8 }}>
        <p className="pequeno">Gasto no mês</p>
        <div className="linha" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="valor-grande">{brl(r.gasto)}</span>
          <span className="pequeno">de {brl(r.entradas)} de entradas</span>
        </div>
        <Barra uso={r.entradas ? r.gasto / r.entradas : 0} cor={r.gasto > r.entradas ? 'var(--erro)' : undefined} />
        <p className="pequeno">
          Reserva do mês: {brl(meta)} ({casa.reservaPct}%) · {brl(separado)} já separados
        </p>
      </section>

      {r.alertas.map((a) => (
        <Link key={a.categoria} to={a.categoria === 'Mercado' ? '/lista' : '/lancar'} className="cartao alerta" style={{ gap: 4, textDecoration: 'none', color: 'inherit' }}>
          <strong style={{ color: a.uso > 1 ? 'var(--erro)' : 'var(--alerta)' }}>
            {a.categoria} {a.uso > 1 ? 'passou do limite' : `em ${Math.round(a.uso * 100)}% do limite`}
          </strong>
          <span className="pequeno">
            {brl(a.gasto)} de {brl(a.limite)}. Ainda faltam {diasRestantes} dias no mês.
          </span>
        </Link>
      ))}

      <section className="cartao" style={{ gap: 12 }}>
        <div className="linha entre">
          <h2>Por categoria</h2>
          <Link to="/lancar" className="botao texto" style={{ textDecoration: 'none', fontSize: 14 }}>+ Lançar gasto</Link>
        </div>
        {r.categorias.length === 0 && <p className="vazio">Nenhum gasto este mês ainda.</p>}
        {r.categorias.map((c) => (
          <div key={c.categoria} className="coluna" style={{ gap: 6 }}>
            <div className="linha entre">
              <span style={{ fontSize: 14, fontWeight: 500 }}>{c.categoria}</span>
              <span className="pequeno" style={{ color: c.uso && c.uso > 1 ? 'var(--erro)' : undefined }}>
                {brl(c.gasto)}
                {c.limite ? ` / ${brl(c.limite)}` : ''}
              </span>
            </div>
            {c.limite ? <Barra uso={c.uso!} cor={corDoUso(c.uso!)} /> : null}
          </div>
        ))}
      </section>

      {cartoes.length > 0 && porCartao.length > 0 && (
        <section className="cartao" style={{ gap: 8 }}>
          <h2>Por cartão</h2>
          {porCartao.map((c) => (
            <div key={c.nome} className="linha entre">
              <span style={{ fontSize: 14 }}>{c.nome}</span>
              <span className="pequeno">{brl(c.valor)}</span>
            </div>
          ))}
        </section>
      )}

      <Link to="/lista" className="botao" style={{ textAlign: 'center', textDecoration: 'none' }}>Começar lista de compras</Link>
      <div className="linha entre">
        <Link to="/historico" className="botao texto" style={{ textDecoration: 'none' }}>Histórico de compras</Link>
        <Link to="/cartoes" className="botao texto" style={{ textDecoration: 'none' }}>Cartões</Link>
      </div>
    </div>
  )
}
