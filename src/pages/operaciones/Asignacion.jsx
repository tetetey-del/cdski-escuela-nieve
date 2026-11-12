import { useState } from 'react'
import { UserPlus, UserMinus, TriangleAlert, Ban, Copy, Languages, ChevronDown } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { hora, nivel, disciplina, fechaLarga, fechaCorta, sumarDias, diaSemana } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Tarjeta, Titulo, Boton, Modal, Campo, entrada, Aviso, Vacio } from '../../components/ui'

const ACTIVAS = ['solicitud', 'pendiente_pago', 'confirmada', 'en_curso']

export default function Asignacion() {
  const { hoy } = useSesion()
  const [desde, setDesde] = useState(hoy)
  const [solo, setSolo] = useState(true)
  const [clase, setClase] = useState(null)
  const hasta = sumarDias(desde, 7)
  const lista = useDatos(() => q(supabase.from('clases').select(`id, numero, idioma, cancelada_clima, instructor_id, instructor:instructores(nombre, categoria),
    turno:turnos!inner(id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cupo_total, cupo_ocupado, cerrado_clima,
      producto:productos(nombre, tipo), centro:centros(nombre), reservas(estado, participantes(id)))`)
    .gte('turno.fecha', desde).lte('turno.fecha', hasta).eq('cancelada_clima', false)), [desde])

  const clases = (lista.datos || [])
    .map((c) => ({ ...c, alumnos: c.turno.reservas.filter((r) => ACTIVAS.includes(r.estado)).reduce((a, r) => a + r.participantes.length, 0) }))
    .filter((c) => c.alumnos > 0 && (!solo || !c.instructor_id))
    .sort((a, b) => (a.turno.fecha + a.turno.hora_inicio).localeCompare(b.turno.fecha + b.turno.hora_inicio))

  return (
    <Pagina>
      <Titulo sub="Solo se ofrecen instructores habilitados y libres. Si un límite no se cumple, hace falta una justificación escrita.">Asignación de instructores</Titulo>
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Desde"><input type="date" className={entrada} value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} /></Campo>
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" className="size-5 accent-[#0B3C5D]" checked={solo} onChange={(e) => setSolo(e.target.checked)} /> Solo sin instructor
        </label>
        <p className="pb-2 text-pizarra/70">Próximos 8 días hasta {fechaCorta(hasta)}</p>
      </div>
      <ErrorAccion error={lista.error} onActualizar={lista.recargar} className="mt-3" />
      {lista.cargando ? <Cargando /> : (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {clases.length === 0 && <Vacio>{solo ? 'Todas las clases con alumnos tienen instructor.' : 'No hay clases en estas fechas.'}</Vacio>}
          {clases.map((c) => (
            <button key={c.id} onClick={() => setClase(c)}
              className={`rounded-2xl bg-white p-3 text-left ring-2 hover:ring-cielo ${c.instructor ? 'ring-glaciar/10' : 'ring-alerta'}`}>
              <div className="flex justify-between gap-2">
                <p className="font-bold">{diaSemana(c.turno.fecha)} {fechaCorta(c.turno.fecha)} · {hora(c.turno.hora_inicio)}–{hora(c.turno.hora_fin)}</p>
                <p className="font-bold">{c.alumnos} alumnos</p>
              </div>
              <p className="text-lg font-semibold text-glaciar">{c.turno.producto.nombre}{c.turno.grupo > 1 ? ` · G${c.turno.grupo}` : ''}{c.numero > 1 ? ` · instructor ${c.numero}` : ''}</p>
              <p className="text-pizarra/80">{c.turno.centro.nombre} · {nivel(c.turno.nivel)} · {disciplina(c.turno.disciplina)}{c.idioma === 'en' ? ' · inglés' : ''}</p>
              <p className={`mt-1 font-semibold ${c.instructor ? 'text-ok' : 'text-[#b34a0f]'}`}>
                {c.instructor ? `${c.instructor.nombre} (Nivel ${c.instructor.categoria})` : <span className="inline-flex items-center gap-1"><TriangleAlert className="size-4" /> Sin instructor</span>}
              </p>
            </button>
          ))}
        </div>
      )}
      {clase && <PanelAsignar clase={clase} onCerrar={() => setClase(null)} onCambio={() => { lista.recargar(); setClase(null) }} />}
    </Pagina>
  )
}

function PanelAsignar({ clase, onCerrar, onCambio }) {
  const t = clase.turno
  const opciones = useDatos(() => rpc('instructores_para_clase', { p_clase: clase.id }), [clase.id])
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [justificar, setJustificar] = useState(null)
  const [texto, setTexto] = useState('')
  const [verNo, setVerNo] = useState(false)
  const [info, setInfo] = useState(null)

  const asignar = async (i, justificacion = null) => {
    setOcupado(i.instructor_id); setError(null)
    try { await rpc('asignar_instructor', { p_clase: clase.id, p_instructor: i.instructor_id, p_justificacion: justificacion }); onCambio() }
    catch (e) { setError(e); opciones.recargar() } finally { setOcupado(null) }
  }
  const accion = async (fn, args, mensaje) => {
    setOcupado(fn); setError(null)
    try { const r = await rpc(fn, args); if (mensaje) setInfo(mensaje(r)); else onCambio() } catch (e) { setError(e) } finally { setOcupado(null) }
  }

  const libres = (opciones.datos || []).filter((i) => i.libre)
  const conLimite = (opciones.datos || []).filter((i) => i.habilitado && !i.libre)
  const noHabilitados = (opciones.datos || []).filter((i) => !i.habilitado)
  const lleno = t.cupo_ocupado >= t.cupo_total && ['grupal', 'chicos'].includes(t.producto.tipo)

  return (
    <Modal abierto titulo="Asignar instructor" onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="text-lg font-semibold">{t.producto.nombre}{t.grupo > 1 ? ` · grupo ${t.grupo}` : ''} · {t.centro.nombre}</p>
      <p className="text-pizarra/80">{fechaLarga(t.fecha)} · {hora(t.hora_inicio)}–{hora(t.hora_fin)} · {nivel(t.nivel)} · {disciplina(t.disciplina)} · {clase.alumnos} alumnos</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {clase.instructor && <Boton variante="secundario" cargando={ocupado === 'quitar_instructor'} onClick={() => accion('quitar_instructor', { p_clase: clase.id })}><UserMinus className="size-4" /> Quitar a {clase.instructor.nombre}</Boton>}
        <Boton variante="suave" cargando={ocupado === 'cambiar_idioma_clase'} onClick={() => accion('cambiar_idioma_clase', { p_clase: clase.id, p_idioma: clase.idioma === 'en' ? 'es' : 'en' })}>
          <Languages className="size-4" /> {clase.idioma === 'en' ? 'Pasar a español' : 'Dictar en inglés'}
        </Boton>
        {lleno && <Boton variante="suave" cargando={ocupado === 'abrir_grupo_paralelo'} onClick={() => accion('abrir_grupo_paralelo', { p_turno: t.id },
          (r) => `Se abrió el grupo ${r.grupo} con el mismo cupo. ${r.espera_movida} personas de la lista de espera pasaron al grupo nuevo y ${r.ofertas} recibieron una oferta de lugar.`)}>
          <Copy className="size-4" /> Abrir grupo paralelo</Boton>}
      </div>
      {info && <Aviso tipo="ok" className="mt-3">{info} <button className="font-semibold underline" onClick={onCambio}>Listo</button></Aviso>}
      <ErrorAccion error={error} className="mt-3" onActualizar={opciones.recargar} />

      {opciones.cargando ? <Cargando /> : (
        <>
          <h3 className="mt-4 text-lg font-bold uppercase text-ok">Disponibles ({libres.length})</h3>
          {libres.length === 0 && <p className="text-pizarra/70">No hay instructores habilitados y libres para esta clase.</p>}
          <ul className="space-y-2">
            {libres.map((i) => (
              <li key={i.instructor_id} className="flex items-center justify-between gap-2 rounded-xl p-2 ring-1 ring-ok/40">
                <span><strong>{i.nombre}</strong> · Nivel {i.categoria} · {disciplina(i.disciplina)}{i.apto_ninos ? ' · Apto niños' : ''}{i.ingles ? ' · Inglés' : ''}
                  <span className="block text-sm text-pizarra/70">{i.horas_dia} h asignadas ese día</span></span>
                <Boton cargando={ocupado === i.instructor_id} onClick={() => asignar(i)}><UserPlus className="size-4" /> Asignar</Boton>
              </li>
            ))}
          </ul>

          <button onClick={() => setVerNo(!verNo)} className="mt-4 flex items-center gap-1 font-semibold text-glaciar">
            <ChevronDown className={`size-5 transition ${verNo ? 'rotate-180' : ''}`} /> No disponibles ({conLimite.length + noHabilitados.length})
          </button>
          {verNo && (
            <ul className="mt-2 space-y-2">
              {conLimite.map((i) => (
                <li key={i.instructor_id} className="rounded-xl p-2 ring-1 ring-alerta/50">
                  <div className="flex items-center justify-between gap-2">
                    <span><strong>{i.nombre}</strong> · Nivel {i.categoria}</span>
                    <Boton variante="secundario" onClick={() => { setJustificar(i); setTexto('') }}>Asignar con justificación</Boton>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#b34a0f]"><TriangleAlert className="inline size-4" /> {i.motivos_limite.join(' · ')}</p>
                </li>
              ))}
              {noHabilitados.map((i) => (
                <li key={i.instructor_id} className="rounded-xl bg-pizarra/5 p-2">
                  <span className="font-semibold">{i.nombre}</span> · Nivel {i.categoria}
                  <p className="text-sm text-pizarra/70"><Ban className="inline size-4" /> No habilitado: {i.motivos_habilitacion.join(' · ')}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Modal abierto={!!justificar} titulo="Justificación" onCerrar={() => setJustificar(null)}>
        {justificar && (
          <>
            <Aviso tipo="alerta">{justificar.nombre}: {justificar.motivos_limite.join(' · ')}</Aviso>
            <Campo etiqueta="¿Por qué se asigna igual?" ayuda="Queda registrado con tu usuario. Mínimo 10 caracteres." className="mt-3">
              <textarea className={entrada} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            <div className="mt-3 flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setJustificar(null)}>Volver</Boton>
              <Boton disabled={texto.trim().length < 10} cargando={ocupado === justificar.instructor_id}
                onClick={async () => { await asignar(justificar, texto.trim()); setJustificar(null) }}>Asignar</Boton>
            </div>
          </>
        )}
      </Modal>
    </Modal>
  )
}
