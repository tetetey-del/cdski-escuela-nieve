import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, CalendarPlus, Share2, CloudSnow, Wallet, CalendarClock, MapPin } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, fechaLarga, hora, nivel, disciplina, momento, medioPago, decimal, fecha as fFecha, idioma as fIdioma } from '../../lib/formato'
import { descargarIcs, linkWhatsapp, textoReserva } from '../../lib/avisos'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Estado, Tarjeta, Dato, Boton, Modal, Aviso, Campo, entrada, Cupo, Vacio } from '../../components/ui'
import { SELECT_RESERVA } from './MiCuenta'

export default function DetalleReserva() {
  const { id } = useParams()
  const { datos, cargando, error, recargar } = useDatos(async () => {
    const r = await q(supabase.from('reservas').select(`${SELECT_RESERVA}, pagos(id, tipo, monto, medio, fecha, referencia), cierre:cierres_clima(fecha, motivo)`).eq('id', id).single())
    const [previa, nueva] = await Promise.all([
      r.reprogramada_desde ? q(supabase.from('reservas').select('id, codigo').eq('id', r.reprogramada_desde).maybeSingle()) : null,
      r.opcion_clima === 'reprogramar' ? q(supabase.from('reservas').select('id, codigo').eq('reprogramada_desde', r.id).maybeSingle()) : null,
    ])
    return { r, previa, nueva }
  }, [id])
  const [modal, setModal] = useState(null)

  if (cargando) return <Cargando />
  if (error) return <Pagina><ErrorAccion error={error} onActualizar={recargar} /></Pagina>
  const { r, previa, nueva } = datos
  const t = r.turno
  const pagado = r.pagos.filter((p) => p.tipo === 'pago').reduce((a, p) => a + p.monto, 0)
  const cancelable = ['solicitud', 'pendiente_pago', 'confirmada'].includes(r.estado)
  const eligeClima = r.estado === 'afectada_clima' && !r.opcion_clima
  const aviso = {
    codigo: r.codigo, producto: r.producto.nombre, centro: t.centro.nombre, fecha: t.fecha, hora_inicio: t.hora_inicio,
    hora_fin: t.hora_fin, punto_encuentro: t.centro.punto_encuentro, personas: r.participantes.map((x) => x.nombre).join(', '),
    estado: { pendiente_pago: 'Pendiente de pago', confirmada: 'Confirmada', solicitud: 'Solicitud' }[r.estado] || r.estado,
    total: r.estado === 'solicitud' ? null : r.total,
  }

  return (
    <Pagina ancho="max-w-3xl">
      <Link to="/mi-cuenta" className="inline-flex items-center gap-1 font-semibold text-cielo"><ChevronLeft className="size-4" /> Mi cuenta</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-4xl font-bold uppercase leading-none text-glaciar">{r.producto.nombre}</h1>
        <Estado estado={r.estado} grande />
      </div>
      <p className="mt-1 text-pizarra/70">Reserva {r.codigo}</p>

      {eligeClima && (
        <Tarjeta className="mt-4 ring-2 ring-alerta">
          <p className="flex items-center gap-2 text-xl font-bold text-[#b34a0f]"><CloudSnow className="size-6" /> {t.centro.nombre} cerró por clima</p>
          <p className="mt-1">{r.cierre?.motivo}. Elige una de estas dos opciones (no se pueden las dos):</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Boton grande onClick={() => setModal('reprogramar')}><CalendarClock className="size-5" /> Reprogramar</Boton>
            <Boton grande variante="ok" onClick={() => setModal('credito')} disabled={pagado + r.credito_aplicado <= 0}>
              <Wallet className="size-5" /> Crédito 100% · {precio(pagado + r.credito_aplicado)}
            </Boton>
          </div>
          {pagado + r.credito_aplicado <= 0 && <p className="mt-2 text-sm text-pizarra/70">Esta reserva no tenía pagos: puedes reprogramarla sin costo.</p>}
        </Tarjeta>
      )}
      {r.opcion_clima === 'credito' && <Aviso tipo="ok" className="mt-4" titulo="Elegiste crédito">Quedó un crédito de {precio(pagado + r.credito_aplicado)} en tu cuenta para otra reserva de esta temporada.</Aviso>}
      {r.opcion_clima === 'reprogramar' && nueva && <Aviso className="mt-4" titulo="Reprogramada">La nueva reserva es <Link className="font-bold underline" to={`/mi-cuenta/reservas/${nueva.id}`}>{nueva.codigo}</Link>.</Aviso>}
      {previa && <Aviso className="mt-4">Reprogramada desde <Link className="font-bold underline" to={`/mi-cuenta/reservas/${previa.id}`}>{previa.codigo}</Link> por cierre por clima.</Aviso>}
      {r.estado === 'pendiente_pago' && (
        <Aviso tipo="alerta" className="mt-4" titulo={`Paga ${precio(r.total)} antes del ${momento(r.vence_en)}`}>
          Transfiere o paga en nuestra base de Lo Barnechea indicando tu código.
        </Aviso>
      )}
      {r.estado === 'solicitud' && <Aviso className="mt-4" titulo="Esperando cotización">Operaciones está preparando el precio de tu solicitud.</Aviso>}
      {r.producto.tipo === 'heliesqui' && r.clima_confirmado === false && r.estado === 'confirmada' && <Aviso className="mt-4">El vuelo queda sujeto a confirmar el clima el día anterior.</Aviso>}

      <Tarjeta className="mt-4">
        <dl>
          <Dato etiqueta="Fecha">{fechaLarga(t.fecha)}</Dato>
          <Dato etiqueta="Horario">{hora(t.hora_inicio)} a {hora(t.hora_fin)}</Dato>
          <Dato etiqueta="Centro">{t.centro.nombre}</Dato>
          <Dato etiqueta="Nivel y disciplina">{nivel(t.nivel)} · {disciplina(t.disciplina)}</Dato>
          {r.idioma === 'en' && <Dato etiqueta="Idioma">{fIdioma(r.idioma)}</Dato>}
        </dl>
        <p className="mt-3 flex gap-2 rounded-xl bg-hielo p-3"><MapPin className="size-5 shrink-0 text-glaciar" /> <span><strong>Punto de encuentro:</strong> {t.centro.punto_encuentro}. Llega 15 minutos antes.</span></p>
      </Tarjeta>

      <Tarjeta className="mt-4">
        <h2 className="text-xl font-bold uppercase text-glaciar">Personas</h2>
        <ul className="mt-1 divide-y divide-glaciar/10">
          {r.participantes.map((x) => (
            <li key={x.id} className="py-2">
              <p className="font-semibold">{x.nombre} <span className="font-normal text-pizarra/70">· {x.edad} años · {nivel(x.nivel)}</span></p>
              <p className="text-sm text-pizarra/70">{[x.equipo && 'Equipo', x.ropa && 'Ropa', x.traslado && 'Traslado'].filter(Boolean).join(' · ') || 'Sin extras'}{x.asistencia === 'ausente' ? ' · No se presentó' : ''}</p>
            </li>
          ))}
        </ul>
      </Tarjeta>

      {r.estado !== 'solicitud' && (
        <Tarjeta className="mt-4">
          <h2 className="text-xl font-bold uppercase text-glaciar">Pagos</h2>
          <dl className="mt-1">
            <Dato etiqueta="Clases">{precio(r.monto_clases - r.recargo_alta)}</Dato>
            {r.recargo_alta > 0 && <Dato etiqueta="Temporada alta">{precio(r.recargo_alta)}</Dato>}
            {r.monto_extras > 0 && <Dato etiqueta="Extras">{precio(r.monto_extras)}</Dato>}
            {r.credito_aplicado > 0 && <Dato etiqueta="Crédito usado">−{precio(r.credito_aplicado)}</Dato>}
            <Dato etiqueta="Total">{precio(r.total)}</Dato>
            {r.pagos.map((p) => (
              <Dato key={p.id} etiqueta={`${p.tipo === 'pago' ? 'Pago' : 'Reintegro'} · ${medioPago(p.medio)} · ${fFecha(p.fecha)}`}>{p.tipo === 'reintegro' ? '−' : ''}{precio(p.monto)}</Dato>
            ))}
            {r.estado === 'cancelada' && <Dato etiqueta="Reintegro por cancelación">{r.reintegro_pct}% · {precio(r.reintegro_monto)}</Dato>}
          </dl>
        </Tarjeta>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {['pendiente_pago', 'confirmada', 'en_curso'].includes(r.estado) && (
          <Boton variante="secundario" onClick={() => descargarIcs({ titulo: `CDSKI · ${r.producto.nombre}`, fecha: t.fecha, inicio: t.hora_inicio, fin: t.hora_fin, lugar: `${t.centro.nombre} · ${t.centro.punto_encuentro}`, descripcion: textoReserva(aviso), uid: r.codigo })}>
            <CalendarPlus className="size-5" /> Agregar al calendario
          </Boton>
        )}
        <a href={linkWhatsapp(textoReserva(aviso))} target="_blank" rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-glaciar bg-white px-4 font-semibold text-glaciar hover:bg-hielo">
          <Share2 className="size-5" /> Compartir por WhatsApp
        </a>
        {cancelable && <Boton variante="texto" className="justify-self-start text-[#b34a0f]" onClick={() => setModal('cancelar')}>Cancelar reserva</Boton>}
      </div>

      {modal === 'cancelar' && <ModalCancelar r={r} onCerrar={() => setModal(null)} onListo={() => { setModal(null); recargar() }} />}
      {modal === 'credito' && <ModalCredito r={r} monto={pagado + r.credito_aplicado} onCerrar={() => setModal(null)} onListo={() => { setModal(null); recargar() }} />}
      {modal === 'reprogramar' && <ModalReprogramar r={r} onCerrar={() => setModal(null)} />}
    </Pagina>
  )
}

function ModalCancelar({ r, onCerrar, onListo }) {
  const vista = useDatos(() => rpc('vista_cancelacion', { p_reserva: r.id }), [r.id])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const [hecho, setHecho] = useState(null)
  const confirmar = async () => {
    setEnviando(true); setError(null)
    try { setHecho(await rpc('cancelar_reserva', { p_reserva: r.id })) } catch (e) { setError(e) } finally { setEnviando(false) }
  }
  const v = vista.datos
  return (
    <Modal abierto titulo="Cancelar reserva" onCerrar={hecho ? onListo : onCerrar}>
      {vista.cargando && <Cargando />}
      {v && !hecho && (
        <>
          {r.estado === 'confirmada' ? (
            <>
              <p>Faltan <strong>{decimal(v.horas)} horas</strong> para la clase. Con más de 72 horas se devuelve el 100%, entre 72 y 24 horas el 50% y con menos de 24 horas nada.</p>
              <p className="mt-3 rounded-xl bg-hielo p-3 text-lg">Te devolvemos el <strong>{v.pct}%</strong>: <strong>{precio(v.reintegro)}</strong> de {precio(v.pagado)} pagados.</p>
              {v.credito_aplicado > 0 && <p className="mt-2 text-sm">Del crédito usado ({precio(v.credito_aplicado)}) vuelve a tu cuenta el mismo {v.pct}%.</p>}
            </>
          ) : <p>La reserva todavía no tiene pagos, así que no hay nada que devolver.{v.credito_aplicado > 0 && ' El crédito usado vuelve completo a tu cuenta.'}</p>}
          <ErrorAccion error={error} className="mt-3" onActualizar={vista.recargar} />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Boton variante="secundario" onClick={onCerrar}>Volver</Boton>
            <Boton variante="alerta" cargando={enviando} onClick={confirmar}>Sí, cancelar</Boton>
          </div>
        </>
      )}
      {hecho && (
        <>
          <Aviso tipo="ok" titulo="Reserva cancelada" />
          <Boton bloque className="mt-4" onClick={onListo}>Listo</Boton>
        </>
      )}
    </Modal>
  )
}

function ModalCredito({ r, monto, onCerrar, onListo }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const confirmar = async () => {
    setEnviando(true); setError(null)
    try { await rpc('elegir_credito_clima', { p_reserva: r.id }); onListo() } catch (e) { setError(e) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo="Quedarme con crédito" onCerrar={onCerrar}>
      <p>Se guarda un crédito de <strong>{precio(monto)}</strong> (100% de lo pagado) para usar en otra reserva de esta temporada. Si eliges crédito, esta reserva ya no se puede reprogramar.</p>
      <ErrorAccion error={error} className="mt-3" onActualizar={onListo} />
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Volver</Boton>
        <Boton variante="ok" cargando={enviando} onClick={confirmar}>Confirmar crédito</Boton>
      </div>
    </Modal>
  )
}

export function ModalReprogramar({ r, onCerrar, onHecho }) {
  const t = r.turno
  const { hoy } = useSesion()
  const nav = useNavigate()
  const [fechaN, setFechaN] = useState(() => { const d = new Date(hoy + 'T12:00'); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })
  const [centro, setCentro] = useState(t.centro.id)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const pedido = r.producto.a_pedido
  const disp = useDatos(async () => (pedido ? [] : rpc('disponibilidad', { p_producto: r.producto.id, p_fecha: fechaN })), [fechaN])
  const centros = useDatos(() => rpc('catalogo_centros'))
  const n = r.participantes.length
  const grupal = ['grupal', 'chicos'].includes(r.producto.tipo)
  const filas = (disp.datos || []).filter((f) => (grupal ? f.nivel === t.nivel && f.disciplina === t.disciplina : true))

  const elegir = async (f) => {
    setEnviando(true); setError(null)
    try {
      const res = await rpc('reprogramar_reserva', {
        p_reserva: r.id, p_fecha: fechaN, p_centro: f ? f.centro_id : Number(centro), p_hora: f ? f.hora_inicio : r.producto.horarios[0],
        p_disciplina: f?.disciplina || t.disciplina, p_grupo: f?.grupo ?? null,
      })
      if (onHecho) onHecho(res); else nav(`/mi-cuenta/reservas/${res.reserva_id}`)
      onCerrar()
    } catch (e) { setError(e); disp.recargar() } finally { setEnviando(false) }
  }

  return (
    <Modal abierto titulo="Reprogramar" onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="text-pizarra/80">Elige otra fecha para {n} {n === 1 ? 'persona' : 'personas'} (nivel {nivel(t.nivel)}). Se vuelve a comprobar que haya lugar e instructor.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nueva fecha"><input type="date" className={entrada} value={fechaN} min={hoy} onChange={(e) => e.target.value && setFechaN(e.target.value)} /></Campo>
        {pedido && (
          <Campo etiqueta="Centro">
            <select className={entrada} value={centro} onChange={(e) => setCentro(e.target.value)}>
              {(centros.datos || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        )}
      </div>
      <ErrorAccion error={error} className="mt-3" />
      {pedido ? (
        <Boton bloque grande className="mt-4" cargando={enviando} onClick={() => elegir(null)}>Reprogramar para {fechaLarga(fechaN)}</Boton>
      ) : disp.cargando ? <Cargando /> : (
        <div className="mt-3 space-y-2">
          {filas.length === 0 && <Vacio>No hay turnos para ese día.</Vacio>}
          {filas.map((f, i) => {
            const alcanza = !f.cerrado_clima && f.libres >= (f.nivel ? n : 1)
            return (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-2 ring-1 ring-glaciar/15">
                <span><strong>{f.centro}</strong> · {hora(f.hora_inicio)}{f.grupo > 1 ? ` · grupo ${f.grupo}` : ''}</span>
                <span className="flex items-center gap-2">
                  <Cupo etiqueta={f.etiqueta} libres={f.nivel ? f.libres : null} />
                  <Boton disabled={!alcanza} cargando={enviando} onClick={() => elegir(f)}>Elegir</Boton>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
