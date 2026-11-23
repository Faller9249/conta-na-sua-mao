// Junta os dados de um celular com os da casa na nuvem, sem repetir ids.
// Usado quando a segunda pessoa entra na casa e já tinha registrado coisas no próprio celular.
import { normalizarNome } from '../domain/regras'
import type { TabelaSincronizada } from './db'

type Linha = Record<string, unknown> & { id?: unknown }
export type Dados = Partial<Record<TabelaSincronizada, Linha[]>>

/** Tabelas em que o mesmo nome é a mesma coisa nos dois celulares. */
const POR_NOME: TabelaSincronizada[] = ['pessoas', 'cartoes', 'mercados', 'listas']

/** Chaves estrangeiras de cada tabela: campo → tabela apontada. */
const REFERENCIAS: Partial<Record<TabelaSincronizada, Record<string, TabelaSincronizada>>> = {
  cartoes: { pessoaId: 'pessoas' },
  lista: { listaId: 'listas' },
  compras: { mercadoId: 'mercados', listaId: 'listas', cartaoId: 'cartoes' },
  itensCompra: { compraId: 'compras', itemListaId: 'lista' },
  precos: { mercadoId: 'mercados' },
  lancamentos: { compraId: 'compras', pessoaId: 'pessoas', cartaoId: 'cartoes' },
  casa: { listaAtivaId: 'listas' },
}

const COM_ID: TabelaSincronizada[] = ['pessoas', 'cartoes', 'mercados', 'listas', 'lista', 'compras', 'itensCompra', 'precos', 'lancamentos', 'reservas']

/**
 * Devolve as linhas do celular prontas para entrar na casa: ids novos, referências corrigidas,
 * e o que já existe na casa com o mesmo nome (pessoa, cartão, mercado, lista) reaproveitado.
 */
export function mesclarComCasa(local: Dados, remoto: Dados, gerarId: () => number): Dados {
  const mapas = new Map<TabelaSincronizada, Map<unknown, unknown>>()
  const saida: Dados = {}

  for (const t of COM_ID) {
    const mapa = new Map<unknown, unknown>()
    const existentes = new Map<string, unknown>()
    if (POR_NOME.includes(t)) for (const r of remoto[t] ?? []) existentes.set(normalizarNome(String(r.nome ?? '')), r.id)
    for (const l of local[t] ?? []) {
      const igual = POR_NOME.includes(t) ? existentes.get(normalizarNome(String(l.nome ?? ''))) : undefined
      mapa.set(l.id, igual ?? gerarId())
    }
    mapas.set(t, mapa)
  }

  const mercados = mapas.get('mercados')!
  const produtoId = (id: unknown) => {
    const m = typeof id === 'string' ? id.match(/^balanca:(\d+):(.*)$/) : null
    if (!m) return id
    return `balanca:${mercados.get(Number(m[1])) ?? m[1]}:${m[2]}`
  }

  const reescrever = (t: TabelaSincronizada, l: Linha): Linha => {
    const nova: Linha = { ...l }
    if (COM_ID.includes(t)) nova.id = mapas.get(t)!.get(l.id)
    for (const [campo, alvo] of Object.entries(REFERENCIAS[t] ?? {})) {
      if (nova[campo] === undefined || nova[campo] === null) continue
      // Referência a algo que não existe mais neste celular: fica sem.
      nova[campo] = mapas.get(alvo)!.get(nova[campo])
    }
    if ('produtoId' in nova) nova.produtoId = produtoId(nova.produtoId)
    return nova
  }

  for (const t of COM_ID) {
    const jaNaCasa = new Set((remoto[t] ?? []).map((r) => r.id))
    saida[t] = (local[t] ?? []).map((l) => reescrever(t, l)).filter((l) => !jaNaCasa.has(l.id))
  }

  // Produtos: o id é o código; se a casa já conhece, fica o da casa.
  const produtosCasa = new Set((remoto.produtos ?? []).map((p) => p.id))
  saida.produtos = (local.produtos ?? []).map((p) => ({ ...p, id: produtoId(p.id) })).filter((p) => !produtosCasa.has(p.id))

  // Configuração da casa: vale a da nuvem; a deste celular só entra se a casa ainda não tiver.
  saida.casa = (remoto.casa ?? []).length > 0 ? [] : (local.casa ?? []).map((c) => reescrever('casa', c))
  return saida
}
