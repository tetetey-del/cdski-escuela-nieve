import { useState } from 'react'
import { Helicopter, Briefcase, CloudSun, CloudSnow, Share2 } from 'lucide-react'
import { linkWhatsapp } from '../../lib/avisos'
import { rpc, supabase } from '../../lib/supabase'
import { precio, fechaLarga, nivel, momento, personas } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Tarjeta, Titulo, Boton, Modal, Campo, entrada, Aviso, Estado, Seccion, Vacio, BotonLink } from '../../components/ui'
import { SELECT_RESERVA } from '../cliente/MiCuenta'

// Texto listo para avisar al cliente por WhatsApp (no se envía nada automáticamente)
export const textoCotizacion = (r) => [
  `🏔️ CDSKI · Cotización ${r.codigo}`,
  `${r.producto.nombre} · ${r.turno.centro.nombre}`,
  `${fechaLarga(r.turno.fecha)} · ${personas(r.participantes.length)}`,
  `Total: ${precio(r.total)}`,
  `Para confirmar, paga antes del ${momento(r.vence_en)} indicando el código ${r.codigo}.`,
  r.producto.tipo === 'heliesqui' ? 'El vuelo queda sujeto a confirmar el clima el día anterior.' : null,
].filter(Boolean).join('\n')

const BotonWhatsapp = ({ r }) => (
  <a href={linkWhatsapp(textoCotizacion(r))} target="_blank" rel="noreferrer"
    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-glaciar bg-white px-4 font-semibold text-glaciar hover:bg-hielo">
    <Share2 className="size-4" /> Avisar al cliente por WhatsApp
  </a>
)

export default function Solicitudes() {
  const { datos, cargando, error, recargar } = useDatos(async () => {
    const productos = await q(supabase.from('productos').select('id, nombre, precio, tipo, instructores_cada').eq('a_pedido', true))
    const reservas = await q(supabase.from('reservas').select(`${SELECT_RESERVA}, cliente:perfiles(nombre, telefono)`)
      .in('producto_id', productos.map((p) => p.id)).in('estado', ['solicitud', 'pendiente_pago', 'confirmada']).order('creada_en'))
    return { productos, reservas }
  }, [])
  const [cotizar, setCotizar] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)

  if (cargando) return <Cargando />
  if (error) return <Pagina><ErrorAccion error={error} onActualizar={recargar} /></Pagina>
  const prod = Object.fromEntries(datos.productos.map((p) => [p.id, p]))
  const porCotizar = datos.reservas.filter((r) => r.estado === 'solicitud')
  const enCurso = datos.reservas.filter((r) => r.estado !== 'solicitud')

  const clima = async (r, valor) => {
    setErrorAccion(null)
    try { await rpc('confirmar_clima_heli', { p_reserva: r.id, p_confirmado: valor }); recargar() } catch (e) { setErrorAccion(e) }
  }

  const Fila = ({ r }) => {
    const p = prod[r.producto.id]
    const Icono = r.producto.tipo === 'heliesqui' ? Helicopter : Briefcase
    const n = r.participantes.length
    return (
      <Tarjeta>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-xl font-bold"><Icono className="size-6 text-cielo" /> {r.producto.nombre}</p>
            <p>{r.cliente?.nombre} · {r.codigo} · pedida {momento(r.creada_en)}</p>
            <p className="font-semibold">{fechaLarga(r.turno.fecha)} · {r.turno.centro.nombre} · {personas(n)}</p>
            <p className="text-sm text-pizarra/70">Niveles: {[...new Set(r.participantes.map((x) => nivel(x.nivel)))].join(', ')}{p?.instructores_cada ? ` · necesita ${Math.ceil(n / p.instructores_cada)} instructores (1 cada ${p.instructores_cada})` : ''}</p>
            {r.notas && <p className="mt-1 rounded-lg bg-hielo px-2 py-1 text-sm">{r.notas}</p>}
          </div>
          <div className="text-right">
            <Estado estado={r.estado} />
            {r.estado !== 'solicitud' && <p className="mt-1 text-lg font-bold">{precio(r.total)}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {r.estado === 'solicitud' && <Boton onClick={() => setCotizar(r)}>Cotizar</Boton>}
          {r.estado === 'pendiente_pago' && <BotonWhatsapp r={r} />}
          {r.estado !== 'solicitud' && r.producto.tipo === 'heliesqui' && (
            r.clima_confirmado
              ? <span className="inline-flex items-center gap-1 rounded-lg bg-ok/10 px-2 py-1 font-semibold text-ok"><CloudSun className="size-5" /> Clima confirmado</span>
              : <Boton variante="secundario" onClick={() => clima(r, true)}><CloudSun className="size-5" /> Confirmar clima (día anterior)</Boton>
          )}
          {r.estado !== 'solicitud' && r.producto.tipo === 'heliesqui' && r.clima_confirmado && <Boton variante="texto" onClick={() => clima(r, false)}>Deshacer</Boton>}
          {r.estado !== 'solicitud' && <BotonLink variante="suave" to="/operaciones/asignacion">Asignar instructores</BotonLink>}
          {r.estado !== 'solicitud' && <BotonLink variante="suave" to={`/operaciones/clima?fecha=${r.turno.fecha}`}><CloudSnow className="size-4" /> Cierre por clima</BotonLink>}
        </div>
      </Tarjeta>
    )
  }

  return (
    <Pagina ancho="max-w-4xl">
      <Titulo sub="Heliesquí y jornadas corporativas no se confirman solos: se cotizan y recién ahí pasan a pendiente de pago.">Solicitudes a pedido</Titulo>
      <ErrorAccion error={errorAccion} onActualizar={recargar} />
      <Seccion titulo={`Por cotizar (${porCotizar.length})`}>
        {porCotizar.length ? <div className="space-y-2">{porCotizar.map((r) => <Fila key={r.id} r={r} />)}</div> : <Vacio>No hay solicitudes nuevas.</Vacio>}
      </Seccion>
      <Seccion titulo={`Cotizadas y confirmadas (${enCurso.length})`}>
        {enCurso.length ? <div className="space-y-2">{enCurso.map((r) => <Fila key={r.id} r={r} />)}</div> : <Vacio>Sin solicitudes cotizadas.</Vacio>}
      </Seccion>
      {cotizar && <ModalCotizar r={cotizar} p={prod[cotizar.producto.id]} onCerrar={() => { setCotizar(null); recargar() }} />}
    </Pagina>
  )
}

function ModalCotizar({ r, p, onCerrar }) {
  const n = r.participantes.length
  const minimo = p.precio * n
  const [monto, setMonto] = useState(String(minimo))
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [hecha, setHecha] = useState(null)
  const enviar = async () => {
    setEnviando(true); setError(null)
    try {
      await rpc('cotizar_solicitud', { p_reserva: r.id, p_monto_clases: Number(monto), p_nota: nota })
      const nueva = await q(supabase.from('reservas').select(`${SELECT_RESERVA}`).eq('id', r.id).single())
      setHecha(nueva)
    } catch (e) { setError(e) } finally { setEnviando(false) }
  }
  if (hecha) return (
    <Modal abierto titulo="Cotización guardada" onCerrar={onCerrar}>
      <Aviso tipo="ok">La solicitud pasó a pendiente de pago por {precio(hecha.total)}. {r.cliente?.nombre} ya la ve en su cuenta, con plazo hasta el {momento(hecha.vence_en)}.</Aviso>
      <div className="mt-4 grid gap-2">
        <BotonWhatsapp r={hecha} />
        <Boton variante="secundario" onClick={onCerrar}>Listo</Boton>
      </div>
    </Modal>
  )
  return (
    <Modal abierto titulo={`Cotizar ${r.codigo}`} onCerrar={onCerrar}>
      <p>{r.producto.nombre} · {personas(n)} · desde {precio(p.precio)} por persona (mínimo {precio(minimo)}).</p>
      <Campo etiqueta="Precio de la actividad (total, sin extras)" className="mt-3" ayuda={`Equivale a ${precio(Number(monto || 0) / n)} por persona. Los extras se suman aparte.`}>
        <input className={entrada} inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))} />
      </Campo>
      <Campo etiqueta="Nota para el cliente (opcional)" className="mt-3"><textarea className={entrada} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} /></Campo>
      {r.producto.tipo === 'heliesqui' && <Aviso className="mt-3">El heliesquí queda sujeto a confirmar el clima el día anterior.</Aviso>}
      <ErrorAccion error={error} className="mt-3" onActualizar={onCerrar} />
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Volver</Boton>
        <Boton cargando={enviando} disabled={Number(monto) < minimo} onClick={enviar}>Guardar cotización · {precio(monto)}</Boton>
      </div>
    </Modal>
  )
}
