import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, UserCheck, UserX, Package, Shirt, Bus, MapPin, CloudSnow, Lock } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { hora, nivel, disciplina, fechaLarga } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Boton, Aviso, Modal } from '../../components/ui'

export default function Clase() {
  const { id } = useParams()
  const { hoy } = useSesion()
  const { datos: c, cargando, error, recargar } = useDatos(() => q(supabase.from('clases').select(`id, idioma, cancelada_clima, asistencia_cerrada,
    turno:turnos(id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, producto:productos(nombre, tipo), centro:centros(nombre, punto_encuentro),
      reservas(id, codigo, estado, notas, participantes(id, nombre, edad, nivel, equipo, ropa, traslado, asistencia)))`).eq('id', id).single()), [id])
  const [errorAccion, setErrorAccion] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [cerrar, setCerrar] = useState(false)

  if (cargando && !c) return <Cargando />
  if (error) return <Pagina><ErrorAccion error={error} onActualizar={recargar} /></Pagina>
  const t = c.turno
  const reservas = t.reservas.filter((r) => ['confirmada', 'en_curso', 'finalizada', 'afectada_clima'].includes(r.estado))
  const alumnos = reservas.flatMap((r) => r.participantes.map((p) => ({ ...p, reserva: r })))
  const sinMarcar = alumnos.filter((p) => p.asistencia === 'pendiente').length
  const puedeMarcar = !c.asistencia_cerrada && !c.cancelada_clima && t.fecha <= hoy

  const marcar = async (p, valor) => {
    setOcupado(p.id); setErrorAccion(null)
    try { await rpc('marcar_asistencia', { p_participante: p.id, p_asistencia: valor }); recargar() } catch (e) { setErrorAccion(e) } finally { setOcupado(null) }
  }
  const cerrarClase = async () => {
    setOcupado('cerrar'); setErrorAccion(null)
    try { await rpc('cerrar_clase', { p_clase: c.id }); setCerrar(false); recargar() } catch (e) { setErrorAccion(e) } finally { setOcupado(null) }
  }

  return (
    <Pagina ancho="max-w-2xl">
      <Link to="/instructor" className="inline-flex min-h-11 items-center gap-1 text-lg font-semibold text-cielo"><ChevronLeft className="size-5" /> Agenda</Link>
      <h1 className="text-4xl font-bold uppercase leading-none text-glaciar">{t.producto.nombre}{t.grupo > 1 ? ` · G${t.grupo}` : ''}</h1>
      <p className="mt-1 text-xl font-semibold">{fechaLarga(t.fecha)} · {hora(t.hora_inicio)}–{hora(t.hora_fin)}</p>
      <p className="text-lg">{nivel(t.nivel)} · {disciplina(t.disciplina)}{c.idioma === 'en' ? ' · EN INGLÉS' : ''}</p>
      <p className="mt-2 flex gap-2 rounded-xl bg-white p-3 text-lg ring-1 ring-glaciar/15"><MapPin className="size-6 shrink-0 text-glaciar" /> <span><strong>{t.centro.nombre}:</strong> {t.centro.punto_encuentro}</span></p>

      {c.cancelada_clima && <Aviso tipo="alerta" className="mt-3" titulo="Clase cancelada por clima"><CloudSnow className="inline size-4" /> Si el cierre se registró ese día después de las 6:00, recibes el mínimo de 1 hora en tu liquidación.</Aviso>}
      {c.asistencia_cerrada && <Aviso tipo="ok" className="mt-3" titulo="Asistencia cerrada"><Lock className="inline size-4" /> La clase ya se registró y se te paga en la quincena.</Aviso>}
      {!c.asistencia_cerrada && !c.cancelada_clima && t.fecha > hoy && <Aviso className="mt-3">La asistencia se marca el día de la clase.</Aviso>}
      <ErrorAccion error={errorAccion} onActualizar={recargar} className="mt-3" />

      <h2 className="mt-5 text-2xl font-bold uppercase text-glaciar">{alumnos.length} {alumnos.length === 1 ? 'alumno' : 'alumnos'}</h2>
      <ul className="mt-2 space-y-3">
        {alumnos.map((p) => (
          <li key={p.id} className={`rounded-2xl bg-white p-3 ring-2 ${p.asistencia === 'presente' ? 'ring-ok' : p.asistencia === 'ausente' ? 'ring-alerta' : 'ring-glaciar/15'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xl font-bold">{p.nombre}</p>
                <p className="text-pizarra/80">{p.edad} años · {nivel(p.nivel)} · {p.reserva.codigo}</p>
                <p className="mt-1 flex flex-wrap gap-3 text-sm font-semibold text-glaciar">
                  {p.equipo && <span className="inline-flex items-center gap-1"><Package className="size-4" /> Equipo</span>}
                  {p.ropa && <span className="inline-flex items-center gap-1"><Shirt className="size-4" /> Ropa</span>}
                  {p.traslado && <span className="inline-flex items-center gap-1"><Bus className="size-4" /> Traslado</span>}
                </p>
              </div>
              <span className={`titulo rounded-lg px-2 py-1 text-lg font-bold ${p.asistencia === 'presente' ? 'bg-ok text-white' : p.asistencia === 'ausente' ? 'bg-alerta text-white' : 'bg-hielo text-glaciar'}`}>
                {p.asistencia === 'presente' ? '✓ PRESENTE' : p.asistencia === 'ausente' ? '✗ AUSENTE' : 'SIN MARCAR'}
              </span>
            </div>
            {puedeMarcar && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Boton grande variante={p.asistencia === 'presente' ? 'ok' : 'secundario'} cargando={ocupado === p.id} onClick={() => marcar(p, 'presente')}><UserCheck className="size-6" /> Presente</Boton>
                <Boton grande variante={p.asistencia === 'ausente' ? 'alerta' : 'secundario'} cargando={ocupado === p.id} onClick={() => marcar(p, 'ausente')}><UserX className="size-6" /> Ausente</Boton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {reservas.some((r) => r.notas) && (
        <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-glaciar/15">
          <p className="font-bold text-glaciar">Notas de los clientes</p>
          {reservas.filter((r) => r.notas).map((r) => <p key={r.id}>{r.codigo}: {r.notas}</p>)}
        </div>
      )}
      {puedeMarcar && alumnos.length > 0 && (
        <Boton grande bloque className="mt-5" onClick={() => setCerrar(true)}><Lock className="size-6" /> Cerrar clase</Boton>
      )}
      <Modal abierto={cerrar} titulo="Cerrar clase" onCerrar={() => setCerrar(false)}>
        <p className="text-lg">{sinMarcar === 0 ? '¿Cerrar la clase?' : <><strong>{sinMarcar} sin marcar</strong> {sinMarcar === 1 ? 'queda como presente' : 'quedan como presentes'}.</>}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Boton grande variante="secundario" onClick={() => setCerrar(false)}>Volver</Boton>
          <Boton grande cargando={ocupado === 'cerrar'} onClick={cerrarClase}>Cerrar</Boton>
        </div>
      </Modal>
    </Pagina>
  )
}
