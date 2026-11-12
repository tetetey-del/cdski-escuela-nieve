import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CloudSnow, Languages, Baby, Users, MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { hora, nivel, disciplina, fechaLarga, sumarDias, diaSemana, aFecha } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Vacio } from '../../components/ui'

export const SELECT_CLASE = `id, numero, idioma, cancelada_clima, asistencia_cerrada,
  turno:turnos!inner(id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, cerrado_clima,
    producto:productos(nombre, tipo), centro:centros(nombre, punto_encuentro),
    reservas(id, estado, participantes(id, asistencia)))`

const ACTIVAS = ['confirmada', 'en_curso', 'finalizada', 'afectada_clima']

export default function Agenda() {
  const { hoy, perfil } = useSesion()
  const [dia, setDia] = useState(null)
  const sel = dia || hoy
  const desde = sumarDias(sel, -3)
  const hasta = sumarDias(sel, 6)
  const { datos, cargando, error, recargar } = useDatos(
    () => q(supabase.from('clases').select(SELECT_CLASE).gte('turno.fecha', desde).lte('turno.fecha', hasta)),
    [desde, hasta],
  )

  const clases = (datos || [])
    .map((c) => ({ ...c, alumnos: c.turno.reservas.filter((r) => ACTIVAS.includes(r.estado)).reduce((a, r) => a + r.participantes.length, 0) }))
    .filter((c) => c.alumnos > 0 || c.cancelada_clima)
  const delDia = clases.filter((c) => c.turno.fecha === sel).sort((a, b) => a.turno.hora_inicio.localeCompare(b.turno.hora_inicio))
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(sel, i - 3))

  return (
    <Pagina ancho="max-w-2xl">
      <p className="text-lg text-pizarra/70">Hola, {perfil?.nombre?.split(' ')[0]}</p>
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setDia(sumarDias(sel, -1))} className="rounded-2xl bg-glaciar p-4 text-white" aria-label="Día anterior"><ChevronLeft className="size-7" /></button>
        <h1 className="text-center text-3xl font-bold uppercase leading-none text-glaciar">{sel === hoy ? 'Hoy' : fechaLarga(sel)}{sel === hoy && <span className="block text-lg font-semibold normal-case text-pizarra/70">{fechaLarga(sel)}</span>}</h1>
        <button onClick={() => setDia(sumarDias(sel, 1))} className="rounded-2xl bg-glaciar p-4 text-white" aria-label="Día siguiente"><ChevronRight className="size-7" /></button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {dias.map((d) => {
          const n = clases.filter((c) => c.turno.fecha === d && !c.cancelada_clima).length
          return (
            <button key={d} onClick={() => setDia(d)}
              className={`rounded-xl py-2 text-center ${d === sel ? 'bg-glaciar text-white' : 'bg-white text-glaciar ring-1 ring-glaciar/15'}`}>
              <span className="block text-xs uppercase">{diaSemana(d)}</span>
              <span className="titulo block text-xl font-bold">{aFecha(d).getDate()}</span>
              <span className="block text-xs">{n ? `${n} cl.` : '–'}</span>
            </button>
          )
        })}
      </div>

      {cargando && <Cargando />}
      <ErrorAccion error={error} onActualizar={recargar} className="mt-3" />
      <div className="mt-4 space-y-3">
        {!cargando && delDia.length === 0 && <Vacio>Sin clases este día.</Vacio>}
        {delDia.map((c) => {
          const t = c.turno
          return (
            <Link key={c.id} to={`/instructor/clases/${c.id}`}
              className={`block rounded-2xl p-4 shadow ${c.cancelada_clima ? 'bg-white ring-4 ring-alerta' : 'bg-glaciar text-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="titulo text-5xl font-bold leading-none">{hora(t.hora_inicio)}<span className="text-2xl opacity-70">–{hora(t.hora_fin)}</span></p>
                {c.cancelada_clima
                  ? <span className="inline-flex items-center gap-1 rounded-lg bg-alerta px-2 py-1 font-bold text-white"><CloudSnow className="size-5" /> CANCELADA POR CLIMA</span>
                  : <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-lg font-bold text-glaciar"><Users className="size-5" /> {c.alumnos}</span>}
              </div>
              <p className="titulo mt-2 text-2xl font-bold uppercase">{t.producto.nombre}{t.grupo > 1 ? ` · G${t.grupo}` : ''}</p>
              <p className="text-lg">{nivel(t.nivel)} · {disciplina(t.disciplina)}</p>
              <p className="mt-1 flex items-center gap-1 text-lg font-semibold"><MapPin className="size-5" /> {t.centro.nombre}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.idioma === 'en' && <span className="inline-flex items-center gap-1 rounded-lg bg-cielo px-2 py-0.5 font-bold text-white"><Languages className="size-4" /> INGLÉS</span>}
                {t.producto.tipo === 'chicos' && <span className="inline-flex items-center gap-1 rounded-lg bg-cielo px-2 py-0.5 font-bold text-white"><Baby className="size-4" /> CHICOS</span>}
                {c.asistencia_cerrada && <span className="rounded-lg bg-ok px-2 py-0.5 font-bold text-white">ASISTENCIA CERRADA</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </Pagina>
  )
}
