import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { cartoesAtivos, lancarGasto } from '../data/repo'
import { hojeISO, lerValor } from '../domain/regras'
import { CATEGORIAS_FINANCEIRAS, type CategoriaFinanceira } from '../domain/tipos'
import { Cabecalho } from '../ui/componentes'

export function LancarGasto() {
  const navegar = useNavigate()
  const pessoas = useLiveQuery(() => db.pessoas.toArray()) ?? []
  const cartoes = useLiveQuery(() => cartoesAtivos(db)) ?? []
  const [cartaoId, setCartaoId] = useState<number | undefined>()
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<CategoriaFinanceira>('Delivery')
  const [descricao, setDescricao] = useState('')
  const [data, setData] = useState(hojeISO())
  const [pessoaId, setPessoaId] = useState<number | ''>('')
  const centavos = lerValor(valor)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!centavos) return
    await lancarGasto(db, { valor: centavos, categoria, descricao, data, pessoaId: pessoaId || undefined, cartaoId })
    navegar('/')
  }

  return (
    <form className="conteudo" onSubmit={salvar}>
      <button type="button" className="botao texto" style={{ alignSelf: 'flex-start' }} onClick={() => navegar(-1)}>‹ Voltar</button>
      <Cabecalho titulo="Lançar gasto" sub="Farmácia, padaria, conta de luz: o que não passou pela lista." />
      <label className="campo">
        Valor (R$)
        <input autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
      </label>
      <div className="campo">
        Categoria
        <div className="chips">
          {CATEGORIAS_FINANCEIRAS.map((c) => (
            <button type="button" key={c} className={`chip${categoria === c ? ' ativo' : ''}`} onClick={() => setCategoria(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <label className="campo">
        Descrição
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: iFood sábado" />
      </label>
      <div className="linha">
        <label className="campo cresce">
          Data
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="campo cresce">
          Quem pagou
          <select value={pessoaId} onChange={(e) => setPessoaId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="campo">
        Pago com
        <div className="chips">
          {cartoes.map((c) => (
            <button type="button" key={c.id} className={`chip${cartaoId === c.id ? ' ativo' : ''}`} onClick={() => setCartaoId(c.id)}>{c.nome}</button>
          ))}
          <button type="button" className={`chip${cartaoId === undefined ? ' ativo' : ''}`} onClick={() => setCartaoId(undefined)}>Não informar</button>
        </div>
        <Link to="/cartoes" className="botao texto" style={{ textDecoration: 'none', alignSelf: 'flex-start', fontSize: 14 }}>+ Cadastrar cartão</Link>
      </div>
      <button className="botao" type="submit" disabled={!centavos}>Salvar gasto</button>
    </form>
  )
}
