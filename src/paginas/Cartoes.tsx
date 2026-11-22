import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { cartoesAtivos, removerCartao, salvarCartao } from '../data/repo'
import { brl, gastoPorCartao, hojeISO, mesDe } from '../domain/regras'
import { TIPOS_CARTAO, type TipoCartao } from '../domain/tipos'
import { Cabecalho } from '../ui/componentes'

export function Cartoes() {
  const navegar = useNavigate()
  const dados = useLiveQuery(async () => ({
    cartoes: await cartoesAtivos(db),
    pessoas: await db.pessoas.toArray(),
    lancamentos: await db.lancamentos.toArray(),
  }))
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<TipoCartao>('Crédito')
  const [pessoaId, setPessoaId] = useState<number | ''>('')
  if (!dados) return null
  const { cartoes, pessoas, lancamentos } = dados
  const porCartao = gastoPorCartao(lancamentos, mesDe(hojeISO()))

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    await salvarCartao(db, { nome, tipo, pessoaId: pessoaId || undefined })
    setNome('')
  }

  return (
    <div className="conteudo">
      <button type="button" className="botao texto" style={{ alignSelf: 'flex-start' }} onClick={() => navegar(-1)}>‹ Voltar</button>
      <Cabecalho titulo="Cartões e contas" sub="Escolha qual foi usado em cada compra para saber quanto saiu de cada um." />

      <section className="coluna">
        {cartoes.length === 0 && <p className="vazio">Nenhum cartão cadastrado.</p>}
        {cartoes.map((c) => (
          <div key={c.id} className="item">
            <div className="cresce">
              <div className="nome">{c.nome}</div>
              <div className="detalhe">
                {c.tipo}
                {c.pessoaId ? ` · ${pessoas.find((p) => p.id === c.pessoaId)?.nome ?? ''}` : ''}
              </div>
            </div>
            <span className="preco" title="Gasto neste mês">{brl(porCartao.get(c.id!) ?? 0)}</span>
            <button className="x" aria-label={`Remover ${c.nome}`} onClick={() => confirm(`Remover “${c.nome}”? As compras antigas continuam com ele.`) && removerCartao(db, c.id!)}>×</button>
          </div>
        ))}
        {cartoes.length > 0 && <p className="pequeno">Valores: gasto neste mês em cada um.</p>}
      </section>

      <form className="cartao" onSubmit={adicionar}>
        <h2>Novo cartão ou conta</h2>
        <label className="campo">
          Apelido
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Inter crédito, Itaú débito" />
        </label>
        <div className="campo">
          Tipo
          <div className="chips">
            {TIPOS_CARTAO.map((t) => (
              <button type="button" key={t} className={`chip${tipo === t ? ' ativo' : ''}`} onClick={() => setTipo(t)}>{t}</button>
            ))}
          </div>
        </div>
        {pessoas.length > 0 && (
          <label className="campo">
            De quem é
            <select value={pessoaId} onChange={(e) => setPessoaId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Da casa</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )}
        <button className="botao" disabled={!nome.trim()}>Salvar cartão</button>
        <p className="pequeno">Use só um apelido. Nunca coloque o número do cartão.</p>
      </form>
    </div>
  )
}
