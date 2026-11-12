import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CloudSnow, UserX, Users, Bus, Package, Clock, FileQuestion, RefreshCw, TriangleAlert, Languages } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { hora, nivel, disciplina, fechaLarga, sumarDias, tipoOrden, momento } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Estado, Boton, BotonLink, Aviso } from '../../components/ui'

const ACTIVAS = ['solicitud', 'pendiente_pago', 'confirmada', 'en_curso', 'finalizada']

export default function Tablero() {
  const { hoy, actualizarReloj } = useSesion()
  const [dia, setDia] = useState(null)
  const sel = dia || hoy
  const [recalc, setRecalc] = useState(false)

  const { datos, cargando, error, recargar } = useDatos(async () => {
    const mant = await rpc('mantenimiento')   // vence pendientes y ofrece lugares a la lista de espera
    actualizarReloj()
    const [turnos, ordenes, cierres, pendientes, solicitudes, ofertas] = await Promise.all([
      q(supabase.from('turnos').select(`id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total, cupo_ocupado, cerrado_clima,
        producto:productos(nombre, tipo), centro:centros(id, nombre),
        clases(id, numero, idioma, cancelada_clima, instructor:instructores(nombre)),
        reservas(estado, participantes(id, traslado, equipo, ropa))`).eq('fecha', sel).order('hora_inicio')),
      q(supabase.from('ordenes_servicio').select('*, proveedor:proveedores(nombre)').eq('fecha', sel).order('tipo')),
      q(supabase.from('cierres_clima').select('centro_id, motivo, registrado_en').eq('fecha', sel)),
      q(supabase.from('reservas').select('id, codigo, vence_en, total').eq('estado', 'pendiente_pago').order('vence_en').limit(5)),
      q(supabase.from('reservas').select('id', { count: 'exact', head: false }).eq('estado', 'solicitud')),
      q(supabase.from('lista_espera').select('id').eq('estado', 'ofrecida')),
    ])
    return { mant, turnos, ordenes, cierres, pendientes, solicitudes: solicitudes.length, ofertas: ofertas.length }
  }, [sel])

  const recalcular = async () => { setRecalc(true); try { await rpc('recalcular_ordenes_dia', { p_fecha: sel }); recargar() } finally { setRecalc(false) } }

  if (cargando && !datos) return <Cargando />
  if (error) return <Pagina><ErrorAccion error={error} onActualizar={recargar} /></Pagina>
  const { turnos, ordenes, cierres, pendientes, solicitudes, ofertas, mant } = datos

  const activos = turnos.map((t) => {
    const res = t.reservas.filter((r) => ACTIVAS.includes(r.estado) || r.estado === 'afectada_clima')
    return { ...t, alumnos: res.reduce((a, r) => a + r.participantes.length, 0), res }
  }).filter((t) => t.alumnos > 0)
  const centros = [...new Map(activos.map((t) => [t.centro.id, t.centro])).values()].sort((a, b) => a.id - b.id)
  const sinInstructor = activos.filter((t) => !t.cerrado_clima && t.clases.some((c) => !c.instructor))
  const totalAlumnos = activos.filter((t) => !t.cerrado_clima).reduce((a, t) => a + t.alumnos, 0)
  const camionetas = ordenes.filter((o) => o.tipo === 'traslado' && ['pedida', 'aceptada', 'cumplida'].includes(o.estado)).reduce((a, o) => a + o.cantidad, 0)

  return (
    <Pagina>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setDia(sumarDias(sel, -1))} className="rounded-xl bg-glaciar p-3 text-white" aria-label="Día anterior"><ChevronLeft className="size-6" /></button>
          <div>
            <h1 className="text-3xl font-bold uppercase leading-none text-glaciar sm:text-4xl">Tablero del día</h1>
            <p className="text-lg font-semibold">{fechaLarga(sel)}{sel === hoy ? ' · hoy' : ''}</p>
          </div>
          <button onClick={() => setDia(sumarDias(sel, 1))} className="rounded-xl bg-glaciar p-3 text-white" aria-label="Día siguiente"><ChevronRight className="size-6" /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonLink to={`/operaciones/clima?fecha=${sel}`} variante="alerta" grande><CloudSnow className="size-5" /> Cierre por clima</BotonLink>
          <Boton variante="secundario" grande cargando={recalc} onClick={recalcular}><RefreshCw className="size-5" /> Recalcular pedidos</Boton>
        </div>
      </div>

      {(mant.vencidas > 0 || mant.ofertas > 0) && (
        <Aviso className="mt-3">Al abrir el tablero vencieron {mant.vencidas} reservas sin pago y se ofrecieron {mant.ofertas} lugares a la lista de espera.</Aviso>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi icono={Users} valor={totalAlumnos} texto="alumnos" to={`/operaciones/reservas?desde=${sel}&hasta=${sel}`} />
        <Kpi icono={UserX} valor={sinInstructor.length} texto="grupos sin instructor" alerta={sinInstructor.length > 0} to="/operaciones/asignacion" />
        <Kpi icono={Bus} valor={camionetas} texto="camionetas" ancla="pedidos" />
        <Kpi icono={FileQuestion} valor={solicitudes} texto="solicitudes por cotizar" alerta={solicitudes > 0} to="/operaciones/solicitudes" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {centros.length === 0 && <p className="text-pizarra/70">No hay clases con alumnos este día.</p>}
        {centros.map((c) => {
          const cierre = cierres.find((x) => x.centro_id === c.id)
          const ts = activos.filter((t) => t.centro.id === c.id)
          return (
            <section key={c.id} className={`rounded-2xl bg-white ring-2 ${cierre ? 'ring-alerta' : 'ring-glaciar/15'}`}>
              <div className={`flex items-center justify-between rounded-t-2xl px-3 py-2 ${cierre ? 'bg-alerta text-white' : 'bg-glaciar text-white'}`}>
                <h2 className="text-2xl font-bold uppercase">{c.nombre.replace('Centro ', '')}</h2>
                <span className="titulo text-lg font-bold">{cierre ? <><CloudSnow className="inline size-5" /> CERRADO</> : `${ts.reduce((a, t) => a + t.alumnos, 0)} alumnos`}</span>
              </div>
              {cierre && <p className="px-3 pt-2 text-sm">{cierre.motivo} · registrado {momento(cierre.registrado_en)}</p>}
              <ul className="divide-y divide-glaciar/10 p-2">
                {ts.map((t) => (
                  <li key={t.id} className="py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="titulo text-2xl font-bold">{hora(t.hora_inicio)}</span>
                      <span className="text-lg font-bold">{t.alumnos}/{t.cupo_total}</span>
                    </div>
                    <p className="font-semibold">{t.producto.nombre}{t.grupo > 1 ? ` · G${t.grupo}` : ''}</p>
                    <p className="text-sm text-pizarra/70">{nivel(t.nivel)} · {disciplina(t.disciplina)}</p>
                    {t.clases.map((cl) => (
                      <p key={cl.id} className={`mt-1 flex items-center gap-1 font-semibold ${cl.instructor ? 'text-glaciar' : 'text-[#b34a0f]'}`}>
                        {cl.instructor ? cl.instructor.nombre : <><TriangleAlert className="size-4" /> SIN INSTRUCTOR</>}
                        {cl.idioma === 'en' && <Languages className="size-4" aria-label="en inglés" />}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section id="pedidos" className="scroll-mt-4 rounded-2xl bg-white p-3 ring-1 ring-glaciar/15">
          <h2 className="text-xl font-bold uppercase text-glaciar">Pedidos a proveedores</h2>
          {ordenes.length === 0 ? <p className="text-pizarra/70">Sin pedidos para este día.</p> : (
            <ul className="divide-y divide-glaciar/10">
              {ordenes.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="flex items-center gap-2">{o.tipo === 'traslado' ? <Bus className="size-5" /> : <Package className="size-5" />}
                    <span><strong>{tipoOrden(o.tipo)} × {o.cantidad}</strong><br /><span className="text-sm text-pizarra/70">{o.proveedor.nombre}</span></span></span>
                  <Estado estado={o.estado} tipo="orden" />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-white p-3 ring-1 ring-glaciar/15">
          <h2 className="text-xl font-bold uppercase text-glaciar">Pagos por registrar</h2>
          {ofertas > 0 && <p className="font-semibold text-[#b34a0f]">{ofertas} lugares ofrecidos a la lista de espera esperan pago.</p>}
          {pendientes.length === 0 ? <p className="text-pizarra/70">No hay reservas pendientes de pago.</p> : (
            <ul className="divide-y divide-glaciar/10">
              {pendientes.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <Link className="font-semibold text-cielo" to={`/operaciones/reservas?q=${r.codigo}`}>{r.codigo}</Link>
                  <span className="flex items-center gap-1 text-sm"><Clock className="size-4" /> vence {momento(r.vence_en)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Pagina>
  )
}

function Kpi({ icono: Icono, valor, texto, alerta, to, ancla }) {
  const contenido = (
    <>
      <Icono className={`size-7 ${alerta ? 'text-white' : 'text-cielo'}`} aria-hidden />
      <p className="titulo text-4xl font-bold leading-none">{valor}</p>
      <p className="text-sm font-semibold">{texto}</p>
    </>
  )
  const clase = `block rounded-2xl p-3 ${alerta ? 'bg-alerta text-white' : 'bg-white text-glaciar ring-1 ring-glaciar/15'}`
  if (ancla) return <button type="button" className={`${clase} text-left`} onClick={() => document.getElementById(ancla)?.scrollIntoView({ behavior: 'smooth' })}>{contenido}</button>
  return to ? <Link to={to} className={clase}>{contenido}</Link> : <div className={clase}>{contenido}</div>
}
