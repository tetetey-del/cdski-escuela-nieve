import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, CircleDollarSign, Hourglass, CalendarClock, Wallet, X } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, hora, nivel, fechaCorta, fechaLarga, momento, medioPago, fecha as fFecha, personas } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Tarjeta, Titulo, Boton, Modal, Campo, entrada, Aviso, Estado, Dato, Seccion, Vacio } from '../../components/ui'
import { SELECT_RESERVA } from '../cliente/MiCuenta'
import { ModalReprogramar } from '../cliente/DetalleReserva'

const ESTADOS = [['', 'Todos'], ['pendiente_pago', 'Pendiente de pago'], ['confirmada', 'Confirmada'], ['afectada_clima', 'Afectada por clima'],
  ['solicitud', 'Solicitud'], ['en_curso', 'En curso'], ['finalizada', 'Finalizada'], ['cancelada', 'Cancelada'], ['vencida', 'Vencida']]

export default function Reservas() {
  const { hoy } = useSesion()
  const [params] = useSearchParams()
  const [f, setF] = useState({ texto: params.get('q') || '', estado: '', desde: '', hasta: '' })
  const [abierta, setAbierta] = useState(null)
  const [tab, setTab] = useState('reservas')

  const { datos, cargando, error, recargar } = useDatos(async () => {
    await rpc('mantenimiento')
    let consulta = supabase.from('reservas').select(`${SELECT_RESERVA}, cliente:perfiles(nombre, telefono), pagos(id, tipo, monto, medio, fecha, referencia)`)
      .order('creada_en', { ascending: false }).limit(200)
    if (f.estado) consulta = consulta.eq('estado', f.estado)
    const reservas = await q(consulta)
    const espera = await q(supabase.from('lista_espera').select('id, estado, cantidad, creado_en, vence_en, reserva_id, cliente:perfiles(nombre), turno:turnos(id, fecha, hora_inicio, nivel, grupo, cupo_total, cupo_ocupado, producto:productos(nombre), centro:centros(nombre))')
      .in('estado', ['esperando', 'ofrecida']).order('creado_en'))
    return { reservas, espera }
  }, [f.estado])

  const texto = f.texto.trim().toLowerCase()
  const lista = (datos?.reservas || []).filter((r) =>
    (!texto || r.codigo.toLowerCase().includes(texto) || r.cliente?.nombre.toLowerCase().includes(texto)) &&
    (!f.desde || r.turno?.fecha >= f.desde) && (!f.hasta || r.turno?.fecha <= f.hasta))
  const reserva = abierta && datos?.reservas.find((r) => r.id === abierta)

  // lista de espera agrupada por turno, con su posición
  const porTurno = {}
  for (const e of datos?.espera || []) (porTurno[e.turno.id] ||= { turno: e.turno, filas: [] }).filas.push(e)

  return (
    <Pagina>
      <Titulo sub="Busca reservas, registra pagos manuales y revisa la lista de espera.">Reservas y pagos</Titulo>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-white p-1 ring-1 ring-glaciar/15 sm:max-w-md">
        {[['reservas', 'Reservas'], ['espera', `Lista de espera (${datos?.espera.length ?? '…'})`]].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`min-h-11 rounded-lg font-semibold ${tab === k ? 'bg-glaciar text-white' : 'text-glaciar'}`}>{t}</button>
        ))}
      </div>
      <ErrorAccion error={error} onActualizar={recargar} />
      {tab === 'reservas' && (
        <>
          <Tarjeta className="grid gap-3 sm:grid-cols-4">
            <Campo etiqueta="Código o cliente">
              <div className="relative"><Search className="absolute left-3 top-3 size-5 text-pizarra/40" />
                <input className={`${entrada} pl-10`} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="R-… o nombre" /></div>
            </Campo>
            <Campo etiqueta="Estado">
              <select className={entrada} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
                {ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Clase desde"><input type="date" className={entrada} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
            <Campo etiqueta="Clase hasta"><input type="date" className={entrada} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
          </Tarjeta>
          {cargando ? <Cargando /> : (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-pizarra/70">{lista.length} reservas</p>
              {lista.length === 0 && <Vacio>No hay reservas con esos filtros.</Vacio>}
              {lista.map((r) => (
                <button key={r.id} onClick={() => setAbierta(r.id)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-left ring-1 hover:ring-cielo ${r.estado === 'pendiente_pago' ? 'ring-glaciar/40' : 'ring-glaciar/10'}`}>
                  <span className="min-w-0">
                    <span className="font-bold">{r.codigo}</span> · {r.cliente?.nombre}
                    <span className="block text-sm text-pizarra/70">{r.producto.nombre} · {r.turno?.centro?.nombre} · {fechaCorta(r.turno?.fecha)} {hora(r.turno?.hora_inicio)} · {personas(r.participantes.length)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{r.estado === 'solicitud' ? 'por cotizar' : precio(r.total)}</span>
                    <Estado estado={r.estado} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'espera' && (
        <div className="space-y-3">
          {Object.values(porTurno).length === 0 && <Vacio>No hay personas en lista de espera.</Vacio>}
          {Object.values(porTurno).map(({ turno: t, filas }) => (
            <Tarjeta key={t.id}>
              <p className="font-bold">{t.producto.nombre}{t.grupo > 1 ? ` · G${t.grupo}` : ''} · {t.centro.nombre}</p>
              <p className="text-sm text-pizarra/70">{fechaLarga(t.fecha)} {hora(t.hora_inicio)} · {nivel(t.nivel)} · ocupado {t.cupo_ocupado}/{t.cupo_total}</p>
              <ol className="mt-2 space-y-1">
                {filas.map((e, i) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-hielo px-2 py-1">
                    <span><strong>#{i + 1}</strong> {e.cliente.nombre} · {personas(e.cantidad)} · anotado {momento(e.creado_en)}</span>
                    <span className="flex items-center gap-2">
                      <Estado estado={e.estado} />
                      {e.estado === 'ofrecida' && <span className="text-sm">vence {momento(e.vence_en)}</span>}
                      {e.estado === 'esperando' && <Boton variante="texto" onClick={async () => { await rpc('salir_lista_espera', { p_espera: e.id }); recargar() }}><X className="size-4" /> Quitar</Boton>}
                    </span>
                  </li>
                ))}
              </ol>
            </Tarjeta>
          ))}
          <p className="text-sm text-pizarra/70"><Hourglass className="inline size-4" /> Cuando se libera un lugar (cancelación o vencimiento), el primero recibe una reserva pendiente con 12 horas para pagar. Para abrir un grupo paralelo usa Asignación.</p>
        </div>
      )}
      {reserva && <ModalReserva r={reserva} hoy={hoy} onCerrar={() => setAbierta(null)} onCambio={recargar} />}
    </Pagina>
  )
}

function ModalReserva({ r, hoy, onCerrar, onCambio }) {
  const [pago, setPago] = useState({ medio: 'transferencia', fecha: hoy, referencia: '' })
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)
  const [cancelar, setCancelar] = useState(null)
  const [reprogramar, setReprogramar] = useState(false)
  const pagado = r.pagos.filter((p) => p.tipo === 'pago').reduce((a, p) => a + p.monto, 0)

  const ejecutar = async (fn, args, msg) => {
    setOcupado(fn); setError(null); setOk(null)
    try { const res = await rpc(fn, args); setOk(msg(res)); onCambio() } catch (e) { setError(e) } finally { setOcupado(null) }
  }
  const verCancelacion = async () => {
    setError(null)
    try { setCancelar(await rpc('vista_cancelacion', { p_reserva: r.id })) } catch (e) { setError(e) }
  }

  return (
    <Modal abierto titulo={r.codigo} onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="flex flex-wrap items-center gap-2"><Estado estado={r.estado} grande /><span className="font-semibold">{r.cliente?.nombre}</span>{r.cliente?.telefono && <span className="text-pizarra/70">{r.cliente.telefono}</span>}</div>
      <dl className="mt-3">
        <Dato etiqueta="Clase">{r.producto.nombre}</Dato>
        <Dato etiqueta="Cuándo">{fechaLarga(r.turno?.fecha)} · {hora(r.turno?.hora_inicio)}–{hora(r.turno?.hora_fin)}</Dato>
        <Dato etiqueta="Centro">{r.turno?.centro?.nombre}</Dato>
        <Dato etiqueta="Personas">{r.participantes.map((p) => `${p.nombre} (${p.edad}, ${nivel(p.nivel)})`).join(', ')}</Dato>
        {r.estado !== 'solicitud' && <Dato etiqueta="Total">{precio(r.total)}{r.credito_aplicado > 0 && ` (+ ${precio(r.credito_aplicado)} de crédito)`}</Dato>}
        {r.vence_en && <Dato etiqueta="Vence">{momento(r.vence_en)}</Dato>}
        {r.pagos.map((p) => <Dato key={p.id} etiqueta={`${p.tipo === 'pago' ? 'Pago' : 'Reintegro'} · ${medioPago(p.medio)} · ${fFecha(p.fecha)} · ${p.referencia}`}>{precio(p.monto)}</Dato>)}
        {r.notas && <Dato etiqueta="Notas">{r.notas}</Dato>}
      </dl>
      <ErrorAccion error={error} className="mt-3" onActualizar={() => { onCambio(); setError(null) }} />
      {ok && <Aviso tipo="ok" className="mt-3">{ok}</Aviso>}

      {r.estado === 'pendiente_pago' && (
        <Tarjeta className="mt-4 bg-hielo">
          <h3 className="text-lg font-bold uppercase text-glaciar"><CircleDollarSign className="inline size-5" /> Registrar pago de {precio(r.total)}</h3>
          <p className="text-sm text-pizarra/70">No se cobra de verdad: se registra a mano el medio, la fecha y la referencia.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Campo etiqueta="Medio">
              <select className={entrada} value={pago.medio} onChange={(e) => setPago({ ...pago, medio: e.target.value })}>
                <option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option>
              </select>
            </Campo>
            <Campo etiqueta="Fecha"><input type="date" className={entrada} value={pago.fecha} onChange={(e) => setPago({ ...pago, fecha: e.target.value })} /></Campo>
            <Campo etiqueta="Referencia"><input className={entrada} value={pago.referencia} onChange={(e) => setPago({ ...pago, referencia: e.target.value })} placeholder="N° de operación" /></Campo>
          </div>
          <Boton className="mt-3" bloque disabled={!pago.referencia.trim()} cargando={ocupado === 'registrar_pago'}
            onClick={() => ejecutar('registrar_pago', { p_reserva: r.id, p_medio: pago.medio, p_fecha: pago.fecha, p_referencia: pago.referencia },
              () => 'Pago registrado: la reserva quedó confirmada y se actualizaron los pedidos a proveedores.')}>Registrar pago</Boton>
        </Tarjeta>
      )}
      {r.estado === 'afectada_clima' && !r.opcion_clima && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Boton onClick={() => setReprogramar(true)}><CalendarClock className="size-5" /> Reprogramar</Boton>
          <Boton variante="ok" disabled={pagado + r.credito_aplicado <= 0} cargando={ocupado === 'elegir_credito_clima'}
            onClick={() => ejecutar('elegir_credito_clima', { p_reserva: r.id }, (x) => `Se generó un crédito de ${precio(x.monto)} para el cliente.`)}>
            <Wallet className="size-5" /> Crédito 100%</Boton>
        </div>
      )}
      {['solicitud', 'pendiente_pago', 'confirmada'].includes(r.estado) && !cancelar && (
        <Boton variante="texto" className="mt-4 text-[#b34a0f]" onClick={verCancelacion}>Cancelar reserva…</Boton>
      )}
      {cancelar && (
        <Aviso tipo="alerta" className="mt-4" titulo={`Reintegro: ${cancelar.pct}% = ${precio(cancelar.reintegro)}`}>
          Faltan {cancelar.horas} horas para la clase.
          <div className="mt-2 flex gap-2">
            <Boton variante="alerta" cargando={ocupado === 'cancelar_reserva'} onClick={() => ejecutar('cancelar_reserva', { p_reserva: r.id }, (x) => `Reserva cancelada. Reintegro ${x.pct}%: ${precio(x.reintegro)}.`).then(() => setCancelar(null))}>Confirmar cancelación</Boton>
            <Boton variante="secundario" onClick={() => setCancelar(null)}>Volver</Boton>
          </div>
        </Aviso>
      )}
      {reprogramar && <ModalReprogramar r={r} onCerrar={() => setReprogramar(false)} onHecho={(x) => { setOk(`Reprogramada: nueva reserva ${x.codigo} (${fechaCorta(x.fecha)} ${hora(x.hora)}).`); onCambio() }} />}
    </Modal>
  )
}
