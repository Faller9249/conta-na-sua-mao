import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'

/**
 * Leitor de código de barras pela câmera traseira.
 * Sempre oferece digitar o código à mão (sem câmera, no computador ou com código amassado).
 */
export function LeitorCodigo({ aoLer, pausado }: { aoLer: (codigo: string) => void; pausado?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const ultimo = useRef<{ codigo: string; quando: number }>({ codigo: '', quando: 0 })
  const aoLerRef = useRef(aoLer)
  useEffect(() => {
    aoLerRef.current = aoLer
  }, [aoLer])
  const [cameraLigada, setCameraLigada] = useState(false)
  const [erro, setErro] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    if (!cameraLigada || pausado || !video.current) return
    let controles: IScannerControls | undefined
    let cancelado = false
    const leitor = new BrowserMultiFormatReader()
    leitor
      .decodeFromConstraints({ video: { facingMode: 'environment' } }, video.current, (resultado) => {
        if (!resultado) return
        const codigo = resultado.getText()
        const agora = Date.now()
        // A câmera lê o mesmo código várias vezes por segundo: ignora repetição em 2,5 s.
        if (codigo === ultimo.current.codigo && agora - ultimo.current.quando < 2500) return
        ultimo.current = { codigo, quando: agora }
        navigator.vibrate?.(60)
        aoLerRef.current(codigo)
      })
      .then((c) => {
        if (cancelado) c.stop()
        else controles = c
      })
      .catch(() => {
        setErro('Não consegui abrir a câmera. Confira a permissão ou digite o código.')
        setCameraLigada(false)
      })
    return () => {
      cancelado = true
      controles?.stop()
    }
  }, [cameraLigada, pausado])

  function enviarManual(e: React.FormEvent) {
    e.preventDefault()
    const codigo = manual.replace(/\D/g, '')
    if (!codigo) return
    aoLer(codigo)
    setManual('')
  }

  return (
    <section className="leitor" aria-label="Leitor de código de barras">
      {cameraLigada && !pausado ? (
        <>
          <video ref={video} muted playsInline />
          <p className="aviso">Aponte para o código de barras do produto</p>
          <button type="button" className="botao texto" style={{ color: '#fff' }} onClick={() => setCameraLigada(false)}>Desligar câmera</button>
        </>
      ) : (
        <button type="button" className="botao" onClick={() => { setErro(''); setCameraLigada(true) }} disabled={pausado}>
          Escanear com a câmera
        </button>
      )}
      {erro && <p className="aviso" style={{ color: '#ffb4a8' }}>{erro}</p>}
      <form className="linha" style={{ width: '100%' }} onSubmit={enviarManual}>
        <input className="entrada cresce" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="ou digite o código" aria-label="Código de barras" />
        <button className="botao secundario" style={{ width: 'auto', padding: '12px 14px' }} disabled={!manual.trim() || pausado}>OK</button>
      </form>
    </section>
  )
}
