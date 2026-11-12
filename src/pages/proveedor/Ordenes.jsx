import { useState } from 'react'
import { ThumbsUp, CheckCheck, MapPin, Clock } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, fechaLarga, hora, tipoOrden, fechaCorta } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Estado, Tarjeta, Titulo, Vacio, Boton, Seccion } from '../../components/ui'
import { Renglones } from '../instructor/Liquidacion'

export default function Ordenes() {
  const { hoy, perfil } = useSesion()
  const [filtro, setFiltro] = useState('proximas')
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState(null)
  // La base solo devuelve las órdenes de este proveedor (RLS), sin filtrar acá
  const ordenes = useDatos(() => q(supabase.from('ordenes_servicio').select('*, centro:centros(nombre, punto_encuentro)').order('fecha').order('hora')))
  const quincenas = useDatos(() => q(supabase.from('quincenas').select('*').order('inicio')))
  const [quincena, setQuincena] = useState(null)
  const qSel = quincena ?? (quincenas.datos?.find((x) => x.inicio <= hoy && x.fin >= hoy) ?? quincenas.datos?.filter((x) => x.inicio <= hoy).at(-1))?.id
  const renglones = useDatos(async () => (qSel ? q(supabase.from('renglones_liquidacion').select('*').eq('quincena_id', qSel).order('fecha')) : []), [qSel])

  const actualizar = async (o, estado) => {
    setOcupado(o.id); setError(null)
    try { await rpc('actualizar_orden', { p_orden: o.id, p_estado: estado }); ordenes.recargar() } catch (e) { setError(e) } finally { setOcupado(null) }
  }

  const lista = (ordenes.datos || []).filter((o) =>
    filtro === 'proximas' ? o.fecha >= hoy : filtro === 'pendientes' ? ['pedida', 'aceptada'].includes(o.estado) : true)
  const porFecha = {}
  for (const o of lista) (porFecha[o.fecha] ||= []).push(o)

  return (
    <Pagina ancho="max-w-3xl">
      <Titulo>Mis órdenes</Titulo>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 ring-1 ring-glaciar/15">
        {[['proximas', 'Próximas'], ['pendientes', 'Por atender'], ['todas', 'Todas']].map(([k, t]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`min-h-11 rounded-lg font-semibold ${filtro === k ? 'bg-glaciar text-white' : 'text-glaciar'}`}>{t}</button>
        ))}
      </div>
      <ErrorAccion error={error || ordenes.error} onActualizar={ordenes.recargar} className="mt-3" />
      {ordenes.cargando && <Cargando />}
      {!ordenes.cargando && lista.length === 0 && <Vacio>No hay órdenes en esta vista.</Vacio>}
      {Object.entries(porFecha).map(([f, os]) => (
        <Seccion key={f} titulo={fechaLarga(f)}>
          <div className="space-y-2">
            {os.map((o) => (
              <Tarjeta key={o.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xl font-bold">{tipoOrden(o.tipo)} · {o.cantidad} {o.tipo === 'traslado' ? (o.cantidad === 1 ? 'camioneta' : 'camionetas') : 'unidades'}</p>
                    <p className="flex items-center gap-1 text-pizarra/80"><MapPin className="size-4" /> {o.centro?.nombre}</p>
                    <p className="flex items-center gap-1 text-pizarra/80"><Clock className="size-4" /> {o.tipo === 'traslado' ? `Salida ${hora(o.hora)} · ${o.detalle}` : `Entrega ${hora(o.hora)} en el punto de encuentro`}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <Estado estado={o.estado} tipo="orden" />
                  <span className="text-lg font-bold">
                    {o.estado === 'cancelada_con_cargo' ? `Cargo ${precio(o.cargo)}` : o.estado === 'cancelada' ? 'Sin cargo' : precio(o.total)}
                  </span>
                </div>
                {o.estado === 'pedida' && <Boton bloque grande className="mt-3" cargando={ocupado === o.id} onClick={() => actualizar(o, 'aceptada')}><ThumbsUp className="size-5" /> Aceptar</Boton>}
                {['pedida', 'aceptada'].includes(o.estado) && o.fecha <= hoy && (
                  <Boton bloque grande variante="ok" className="mt-2" cargando={ocupado === o.id} onClick={() => actualizar(o, 'cumplida')}><CheckCheck className="size-5" /> Marcar cumplida</Boton>
                )}
              </Tarjeta>
            ))}
          </div>
        </Seccion>
      ))}

      <Seccion titulo="Lo que te paga la escuela">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(quincenas.datos || []).map((x) => (
            <button key={x.id} onClick={() => setQuincena(x.id)} className={`shrink-0 rounded-xl px-3 py-2 font-semibold ${x.id === qSel ? 'bg-glaciar text-white' : 'bg-white ring-1 ring-glaciar/15'}`}>
              {fechaCorta(x.inicio)}–{fechaCorta(x.fin)}
            </button>
          ))}
        </div>
        <Tarjeta>{renglones.cargando ? <Cargando /> : <Renglones renglones={renglones.datos || []} />}</Tarjeta>
      </Seccion>
    </Pagina>
  )
}
