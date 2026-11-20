import { Cabecalho } from '../ui/componentes'

/** A planta da casa, os lugares de guardar e a despensa entram na Fase 2. */
export function Casa() {
  return (
    <div className="conteudo">
      <Cabecalho titulo="Minha casa" sub="Planta da casa, armários e despensa" />
      <section className="cartao verde">
        <h2 style={{ color: 'var(--verde)' }}>Chega na Fase 2</h2>
        <p className="pequeno">
          Aqui vai ficar a planta da casa: toque num cômodo, veja a geladeira e os armários, e cada item da compra vai
          sugerir onde guardar. Também entram os avisos de validade e as receitas com o que tem em casa.
        </p>
      </section>
    </div>
  )
}
