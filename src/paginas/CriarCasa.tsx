import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { criarCasa } from '../data/repo'
import { lerValor } from '../domain/regras'
import { Cabecalho } from '../ui/componentes'

interface PessoaForm {
  nome: string
  entrada: string
  dias: string
}

export function CriarCasa() {
  const navegar = useNavigate()
  const [nome, setNome] = useState('')
  const [pessoas, setPessoas] = useState<PessoaForm[]>([
    { nome: '', entrada: '', dias: '' },
    { nome: '', entrada: '', dias: '' },
  ])
  const [limite, setLimite] = useState('1.500')
  const [pct, setPct] = useState(5)
  const [erro, setErro] = useState('')

  const mudar = (i: number, campo: keyof PessoaForm, valor: string) =>
    setPessoas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)))

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const validas = pessoas.filter((p) => p.nome.trim())
    if (validas.length === 0) return setErro('Coloque pelo menos uma pessoa.')
    const convertidas = validas.map((p) => ({
      nome: p.nome.trim(),
      entradaMensal: lerValor(p.entrada) ?? 0,
      diasPagamento: p.dias
        .split(/[^\d]+/)
        .map(Number)
        .filter((d) => d >= 1 && d <= 31),
    }))
    await criarCasa(db, { nome, reservaPct: pct, limiteMercado: lerValor(limite) ?? undefined, pessoas: convertidas })
    navegar('/', { replace: true })
  }

  return (
    <form className="conteudo" onSubmit={salvar}>
      <div className="linha" style={{ gap: 10 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--verde)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>R$</span>
        <strong style={{ fontSize: 22 }}>Conta na sua Mão</strong>
      </div>
      <Cabecalho titulo="Criar a casa" sub="As finanças do casal num lugar só. Leva 2 minutos." />

      <label className="campo">
        Nome da casa
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Nossa casa" />
      </label>

      <section className="cartao">
        <h2>Entradas do mês</h2>
        {pessoas.map((p, i) => (
          <div key={i} className="coluna" style={{ borderTop: i ? '1px solid var(--borda)' : undefined, paddingTop: i ? 10 : 0 }}>
            <label className="campo">
              Nome
              <input value={p.nome} onChange={(e) => mudar(i, 'nome', e.target.value)} placeholder={`Pessoa ${i + 1}`} />
            </label>
            <div className="linha">
              <label className="campo cresce">
                Salário (R$)
                <input inputMode="decimal" value={p.entrada} onChange={(e) => mudar(i, 'entrada', e.target.value)} placeholder="1.860,00" />
              </label>
              <label className="campo cresce">
                Dias que cai
                <input inputMode="numeric" value={p.dias} onChange={(e) => mudar(i, 'dias', e.target.value)} placeholder="6 e 20" />
              </label>
            </div>
          </div>
        ))}
        <button type="button" className="botao texto" onClick={() => setPessoas((ps) => [...ps, { nome: '', entrada: '', dias: '' }])}>
          + Adicionar outra entrada
        </button>
      </section>

      <label className="campo">
        Limite de mercado por mês (R$)
        <input inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} />
      </label>

      <div className="campo">
        Reserva do mês (% das entradas)
        <div className="chips">
          {[5, 10, 15].map((v) => (
            <button type="button" key={v} className={`chip${pct === v ? ' ativo' : ''}`} onClick={() => setPct(v)}>
              {v}%
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="pequeno" style={{ color: 'var(--erro)' }}>{erro}</p>}
      <button className="botao" type="submit">Criar a casa</button>
      <p className="pequeno" style={{ textAlign: 'center' }}>Os dados ficam só neste celular por enquanto.</p>
    </form>
  )
}
