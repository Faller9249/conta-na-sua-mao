// Sincronização do banco local (IndexedDB) com a casa na nuvem (Supabase, tabela "registros").
// Funciona offline: as alterações ficam na fila e vão quando a internet volta.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { TABELAS_COM_ID, TABELAS_SINCRONIZADAS, novoId, type BancoCasa, type EstadoSync, type Pendente, type TabelaSincronizada } from './db'
import { mesclarComCasa, type Dados } from './mesclar'

interface Registro {
  tabela: string
  chave: string
  dados: Record<string, unknown> | null
  apagado: boolean
  atualizado_em: string
}

const LOTE = 300
const PAGINA = 1000
/** Volta um pouco no tempo a cada busca: duas gravações quase simultâneas na nuvem não se perdem. */
const SOBREPOSICAO_MS = 30_000

function chaveLocal(tabela: string, chave: string): string | number {
  return TABELAS_COM_ID.has(tabela) ? Number(chave) : chave
}

function ehTabela(t: string): t is TabelaSincronizada {
  return (TABELAS_SINCRONIZADAS as readonly string[]).includes(t)
}

/** Envia a fila para a nuvem. Retorna quantas alterações foram enviadas. */
export async function enviar(banco: BancoCasa, cliente: SupabaseClient, casaId: string): Promise<number> {
  const pendentes = await banco.fila.toArray()
  for (let i = 0; i < pendentes.length; i += LOTE) {
    const lote = pendentes.slice(i, i + LOTE)
    const linhas = await Promise.all(
      lote.map(async (p) => {
        const dados = p.op === 'apagar' ? undefined : await banco.table(p.tabela).get(chaveLocal(p.tabela, p.chave))
        return { casa_id: casaId, tabela: p.tabela, chave: p.chave, dados: dados ?? null, apagado: !dados }
      }),
    )
    const { error } = await cliente.from('registros').upsert(linhas, { onConflict: 'casa_id,tabela,chave' })
    if (error) throw error
    // Tira da fila só o que não mudou enquanto enviava.
    const fila = banco.table<Pendente, [string, string]>('fila')
    await banco.transaction('rw', fila, async () => {
      for (const p of lote) {
        const atual = await fila.get([p.tabela, p.chave])
        if (atual?.versao === p.versao) await fila.delete([p.tabela, p.chave])
      }
    })
  }
  return pendentes.length
}

/** Busca registros da casa na nuvem a partir de um momento (ou todos). */
export async function baixar(cliente: SupabaseClient, casaId: string, desde?: string): Promise<Registro[]> {
  const todos: Registro[] = []
  let depois = desde ? new Date(Date.parse(desde) - SOBREPOSICAO_MS).toISOString() : undefined
  for (;;) {
    let q = cliente.from('registros').select('tabela,chave,dados,apagado,atualizado_em').eq('casa_id', casaId).order('atualizado_em').limit(PAGINA)
    if (depois) q = q.gt('atualizado_em', depois)
    const { data, error } = await q
    if (error) throw error
    const pagina = (data ?? []) as Registro[]
    todos.push(...pagina)
    if (pagina.length < PAGINA) break
    depois = pagina[pagina.length - 1].atualizado_em
  }
  return todos
}

/** Grava no celular o que veio da nuvem (sem devolver para a fila). Pula o que está esperando envio aqui. */
export async function aplicar(banco: BancoCasa, registros: Registro[]): Promise<void> {
  if (registros.length === 0) return
  const esperando = new Set((await banco.fila.toArray()).map((p) => `${p.tabela}|${p.chave}`))
  await banco.comoRemoto([...TABELAS_SINCRONIZADAS], async () => {
    for (const r of registros) {
      if (!ehTabela(r.tabela) || esperando.has(`${r.tabela}|${r.chave}`)) continue
      const tabela = banco.table(r.tabela)
      if (r.apagado || !r.dados) await tabela.delete(chaveLocal(r.tabela, r.chave))
      else await tabela.put(r.dados)
    }
  })
}

/** Uma rodada completa: envia o que é daqui, recebe o que é de lá. */
export async function sincronizarUmaVez(banco: BancoCasa, cliente: SupabaseClient, estado: EstadoSync, agora = new Date()) {
  const enviados = await enviar(banco, cliente, estado.casaId)
  const recebidos = await baixar(cliente, estado.casaId, estado.cursor)
  await aplicar(banco, recebidos)
  const cursor = recebidos.reduce((m, r) => (r.atualizado_em > m ? r.atualizado_em : m), estado.cursor ?? '')
  await banco.meta.update('sync', { cursor: cursor || undefined, ultimaSync: agora.toISOString() })
  return { enviados, recebidos: recebidos.length }
}

/** Tudo o que está no celular, por tabela. */
export async function lerTudo(banco: BancoCasa): Promise<Dados> {
  const d: Dados = {}
  for (const t of TABELAS_SINCRONIZADAS) d[t] = (await banco.table(t).toArray()) as Record<string, unknown>[]
  return d
}

/** Põe tudo do celular na fila (quem cria a casa sobe o que já tinha). */
export async function enfileirarTudo(banco: BancoCasa) {
  const pendentes = []
  for (const t of TABELAS_SINCRONIZADAS) {
    for (const k of await banco.table(t).toCollection().primaryKeys()) pendentes.push({ tabela: t, chave: String(k), op: 'gravar' as const, versao: novoId() })
  }
  await banco.fila.bulkPut(pendentes)
}

/**
 * Liga este celular a uma casa da nuvem.
 * - 'subir': a casa é nova e os dados deste celular são os primeiros.
 * - 'juntar': baixa a casa e junta com o que este celular já tinha.
 * - 'descartar': baixa a casa e apaga o que só existia neste celular.
 */
export async function ligarNaCasa(
  banco: BancoCasa,
  cliente: SupabaseClient,
  vinculo: { casaId: string; userId: string },
  modo: 'subir' | 'juntar' | 'descartar',
) {
  if (modo === 'subir') {
    await enfileirarTudo(banco)
    await banco.meta.put({ chave: 'sync', ...vinculo })
    return
  }
  const remotos = await baixar(cliente, vinculo.casaId)
  const local = modo === 'juntar' ? await lerTudo(banco) : {}
  const remoto: Dados = {}
  for (const r of remotos) if (ehTabela(r.tabela) && !r.apagado && r.dados) (remoto[r.tabela] ??= []).push(r.dados)
  const novos = mesclarComCasa(local, remoto, () => novoId())

  await banco.comoRemoto([...TABELAS_SINCRONIZADAS, 'fila'], async () => {
    for (const t of TABELAS_SINCRONIZADAS) await banco.table(t).clear()
    await banco.fila.clear()
    for (const t of TABELAS_SINCRONIZADAS) if (remoto[t]?.length) await banco.table(t).bulkPut(remoto[t]!)
  })
  const cursor = remotos.reduce((m, r) => (r.atualizado_em > m ? r.atualizado_em : m), '')
  await banco.meta.put({ chave: 'sync', ...vinculo, cursor: cursor || undefined })
  // O que veio deste celular entra pela fila, para subir para a casa.
  banco.sincronizar = true
  await banco.transaction('rw', [...TABELAS_SINCRONIZADAS], async () => {
    for (const t of TABELAS_SINCRONIZADAS) if (novos[t]?.length) await banco.table(t).bulkPut(novos[t]!)
  })
}

/** Desliga este celular da casa (os dados ficam no aparelho, sem sincronizar). */
export async function desligarDaCasa(banco: BancoCasa) {
  banco.sincronizar = false
  await banco.transaction('rw', banco.meta, banco.fila, async () => {
    await banco.meta.delete('sync')
    await banco.fila.clear()
  })
}

/** Apaga tudo do celular (ex.: entrou outra conta neste aparelho). */
export async function apagarDadosDoCelular(banco: BancoCasa) {
  banco.sincronizar = false
  await banco.comoRemoto([...TABELAS_SINCRONIZADAS, 'fila', 'meta'], async () => {
    for (const t of [...TABELAS_SINCRONIZADAS, 'fila', 'meta']) await banco.table(t).clear()
  })
}

// ---------- Rodando no app ----------

export type SituacaoSync = 'desligada' | 'sincronizando' | 'ok' | 'offline' | 'erro'
export interface StatusSync {
  situacao: SituacaoSync
  ultima?: string
  erro?: string
}

/** Mantém a sincronização rodando: ao mudar algo, ao voltar para o app, a cada minuto e quando o outro celular grava. */
export class Sincronizador {
  private status: StatusSync = { situacao: 'desligada' }
  private ouvintes = new Set<() => void>()
  private timer?: ReturnType<typeof setTimeout>
  private intervalo?: ReturnType<typeof setInterval>
  private canal?: RealtimeChannel
  private rodando = false
  private deNovo = false
  private casaId?: string
  private readonly aoVoltar = () => this.agendar(300)

  private banco: BancoCasa
  private cliente: SupabaseClient

  constructor(banco: BancoCasa, cliente: SupabaseClient) {
    this.banco = banco
    this.cliente = cliente
  }

  iniciar(casaId: string) {
    if (this.casaId === casaId) return
    this.parar()
    this.casaId = casaId
    this.banco.sincronizar = true
    this.banco.aoEnfileirar = () => this.agendar(1500)
    this.canal = this.cliente
      .channel(`casa-${casaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registros', filter: `casa_id=eq.${casaId}` }, () => this.agendar(500))
      .subscribe()
    this.intervalo = setInterval(() => this.agendar(0), 60_000)
    window.addEventListener('online', this.aoVoltar)
    window.addEventListener('focus', this.aoVoltar)
    document.addEventListener('visibilitychange', this.aoVoltar)
    this.agendar(0)
  }

  parar() {
    if (this.canal) void this.cliente.removeChannel(this.canal)
    this.canal = undefined
    clearInterval(this.intervalo)
    clearTimeout(this.timer)
    window.removeEventListener('online', this.aoVoltar)
    window.removeEventListener('focus', this.aoVoltar)
    document.removeEventListener('visibilitychange', this.aoVoltar)
    this.banco.aoEnfileirar = undefined
    this.banco.sincronizar = false
    this.casaId = undefined
    this.mudar({ situacao: 'desligada' })
  }

  agendar(ms: number) {
    if (!this.casaId) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.rodar(), ms)
  }

  async agora() {
    await this.rodar()
  }

  private async rodar() {
    if (!this.casaId) return
    if (this.rodando) {
      this.deNovo = true
      return
    }
    this.rodando = true
    this.mudar({ ...this.status, situacao: 'sincronizando' })
    try {
      const estado = await this.banco.meta.get('sync')
      if (!estado) throw new Error('Celular não está ligado a uma casa.')
      await sincronizarUmaVez(this.banco, this.cliente, estado)
      this.mudar({ situacao: 'ok', ultima: new Date().toISOString() })
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      this.mudar({ ...this.status, situacao: offline ? 'offline' : 'erro', erro: (e as Error).message })
    } finally {
      this.rodando = false
      if (this.deNovo) {
        this.deNovo = false
        this.agendar(200)
      }
    }
  }

  private mudar(s: StatusSync) {
    this.status = s
    for (const f of this.ouvintes) f()
  }

  assinar = (f: () => void) => {
    this.ouvintes.add(f)
    return () => this.ouvintes.delete(f)
  }

  ler = () => this.status
}

export function useStatusSync(s: Sincronizador | null): StatusSync {
  return useSyncExternalStore(s?.assinar ?? semOuvinte, s?.ler ?? desligada)
}
const semOuvinte = () => () => {}
const DESLIGADA: StatusSync = { situacao: 'desligada' }
const desligada = () => DESLIGADA
