import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CloudSnow, Eye, Users, UserCheck, Truck } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, hora, nivel, fechaLarga, momento, tipoOrden, fecha as fFecha } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Tarjeta, Titulo, Boton, Campo, entrada, Aviso, Estado, Seccion, Vacio } from '../../components/ui'

export default function Clima() {
  const { hoy } = useSesion()
  const [params] = useSearchParams()
  const centros = useDatos(() => rpc('catalogo_centros'))
  const historial = useDatos(() => q(supabase.from('cierres_clima').select('*, centro:centros(nombre)').order('fecha', { ascending: false })))
  const [f, setF] = useState({ centro: '', fecha: params.get('fecha') || hoy, motivo: '' })
  const [vista, setVista] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [resultado, setResultado] = useState(null)
  const centro = f.centro || centros.datos?.[1]?.id || ''

  const verAfectados = async () => {
    setCargando(true); setError(null); setResultado(null)
    try { setVista(await rpc('vista_previa_cierre', { p_centro: Number(centro), p_fecha: f.fecha })) } catch (e) { setError(e) } finally { setCargando(false) }
  }
  const aplicar = async () => {
    setCargando(true); setError(null)
    try {
      const r = await rpc('aplicar_cierre_clima', { p_centro: Number(centro), p_fecha: f.fecha, p_motivo: f.motivo })
      setResultado(r); setVista(null); historial.recargar()
    } catch (e) { setError(e) } finally { setCargando(false) }
  }

  return (
    <Pagina ancho="max-w-4xl">
      <Titulo sub="Antes de confirmar ves exactamente qué se afecta: reservas, instructores y pedidos a proveedores.">Cierre por clima</Titulo>
      <Tarjeta>
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <Campo etiqueta="Centro">
            <select className={entrada} value={centro} onChange={(e) => { setF({ ...f, centro: e.target.value }); setVista(null) }}>
              {(centros.datos || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Fecha"><input type="date" className={entrada} value={f.fecha} onChange={(e) => { setF({ ...f, fecha: e.target.value }); setVista(null) }} /></Campo>
          <Boton grande cargando={cargando && !vista} onClick={verAfectados}><Eye className="size-5" /> Ver qué se afecta</Boton>
        </div>
      </Tarjeta>
      <ErrorAccion error={error} className="mt-3" onActualizar={verAfectados} />
      {resultado && (
        <Aviso tipo="ok" className="mt-3" titulo={resultado.repetida ? 'Ese cierre ya estaba registrado' : 'Cierre aplicado'}>
          {resultado.repetida ? 'No se volvió a cancelar ni a cobrar nada.' :
            `${resultado.reservas} reservas pasaron a "Afectada por clima" y cada cliente ya puede elegir reprogramar o crédito del 100% en su cuenta. Se cancelaron ${resultado.ordenes} pedidos a proveedores y ${resultado.espera_cancelada} personas salieron de la lista de espera. Los mínimos de los instructores aparecen en la liquidación de la quincena.`}
        </Aviso>
      )}

      {vista && (
        <>
          {vista.ya_cerrado && <Aviso tipo="alerta" className="mt-3">Este centro ya está cerrado ese día.</Aviso>}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Resumen icono={Users} valor={vista.total_personas} texto={`alumnos en ${vista.reservas.length} reservas`} />
            <Resumen icono={UserCheck} valor={precio(vista.total_minimos)} texto="mínimos a instructores" />
            <Resumen icono={Truck} valor={precio(vista.total_cargos)} texto="cargos de proveedores" />
          </div>
          <p className="mt-2 text-sm text-pizarra/70">
            Se registraría el {fFecha(String(vista.registro).slice(0, 10))} a las {String(vista.registro).slice(11, 16)} (hora de la escuela). {vista.paga_minimo
              ? 'Como es el mismo día y después de las 6:00, los instructores asignados reciben 1 hora de su tarifa.'
              : 'No corresponde mínimo a instructores: el cierre no es del mismo día después de las 6:00.'}
          </p>

          <Seccion titulo={`Reservas (${vista.reservas.length})`}>
            <Tarjeta className="p-0">
              {vista.reservas.length === 0 ? <p className="p-3">No hay reservas activas.</p> : (
                <ul className="divide-y divide-glaciar/10">
                  {vista.reservas.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <span><strong>{hora(r.hora)}</strong> · {r.producto} · {r.cliente} <span className="text-pizarra/60">({r.codigo})</span></span>
                      <span className="flex items-center gap-2"><span className="font-semibold">{r.personas} p · {precio(r.pagado)}</span><Estado estado={r.estado} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </Seccion>
          <Seccion titulo={`Instructores (${vista.clases.length} grupos)`}>
            <Tarjeta className="p-0">
              <ul className="divide-y divide-glaciar/10">
                {vista.clases.map((c) => (
                  <li key={c.clase_id} className="flex justify-between gap-2 p-3">
                    <span><strong>{hora(c.hora)}</strong> · {c.producto}{c.grupo > 1 ? ` G${c.grupo}` : ''} · {nivel(c.nivel)} · {c.instructor || <em className="text-[#b34a0f]">sin instructor</em>}</span>
                    <span className="font-semibold">{c.minimo ? `Mínimo ${precio(c.minimo)}` : '—'}</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          </Seccion>
          <Seccion titulo={`Pedidos a proveedores (${vista.ordenes.length})`}>
            <Tarjeta className="p-0">
              {vista.ordenes.length === 0 ? <p className="p-3">Sin pedidos activos.</p> : (
                <ul className="divide-y divide-glaciar/10">
                  {vista.ordenes.map((o) => (
                    <li key={o.id} className="flex flex-wrap justify-between gap-2 p-3">
                      <span><strong>{tipoOrden(o.tipo)} × {o.cantidad}</strong> · {o.proveedor} · faltan {o.horas} h</span>
                      <span className={`font-semibold ${o.cargo ? 'text-[#b34a0f]' : 'text-ok'}`}>{o.cargo ? `Cargo 50%: ${precio(o.cargo)}` : 'Sin cargo'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </Seccion>
          {!vista.ya_cerrado && (
            <Tarjeta className="mt-4 ring-2 ring-alerta">
              <Campo etiqueta="Motivo (lo ven los clientes)">
                <input className={entrada} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Ej.: Tormenta de nieve, el centro no abre andariveles" />
              </Campo>
              <Boton grande bloque variante="alerta" className="mt-3" disabled={!f.motivo.trim()} cargando={cargando} onClick={aplicar}>
                <CloudSnow className="size-6" /> Confirmar cierre de {vista.centro} · {fechaLarga(vista.fecha)}
              </Boton>
            </Tarjeta>
          )}
        </>
      )}

      <Seccion titulo="Cierres registrados">
        {historial.cargando ? <Cargando /> : (historial.datos || []).length === 0 ? <Vacio>Sin cierres.</Vacio> : (
          <Tarjeta className="p-0">
            <ul className="divide-y divide-glaciar/10">
              {historial.datos.map((c) => (
                <li key={c.id} className="p-3"><strong>{fFecha(c.fecha)}</strong> · {c.centro.nombre} · {c.motivo} <span className="text-sm text-pizarra/60">(registrado {momento(c.registrado_en)})</span></li>
              ))}
            </ul>
          </Tarjeta>
        )}
      </Seccion>
    </Pagina>
  )
}

const Resumen = ({ icono: Icono, valor, texto }) => (
  <div className="rounded-2xl bg-white p-3 text-glaciar ring-1 ring-glaciar/15">
    <Icono className="size-6 text-alerta" aria-hidden />
    <p className="titulo text-2xl font-bold sm:text-3xl">{valor}</p>
    <p className="text-sm">{texto}</p>
  </div>
)
