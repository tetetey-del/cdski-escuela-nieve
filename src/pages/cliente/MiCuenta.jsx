import { Link } from 'react-router-dom'
import { ChevronRight, Wallet, Hourglass, CloudSnow } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, fechaLarga, aFecha, hora, momento, personas } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Estado, Tarjeta, Titulo, Seccion, Vacio, BotonLink, Aviso } from '../../components/ui'

export const SELECT_RESERVA = `id, codigo, estado, total, credito_aplicado, monto_clases, monto_extras, recargo_alta, vence_en,
  opcion_clima, cierre_clima_id, reprogramada_desde, reintegro_pct, reintegro_monto, idioma, notas, creada_en, clima_confirmado,
  producto:productos(id, nombre, codigo, tipo, a_pedido, horarios),
  turno:turnos(id, fecha, hora_inicio, hora_fin, nivel, disciplina, grupo, centro:centros(id, nombre, punto_encuentro)),
  participantes(id, nombre, edad, nivel, equipo, ropa, traslado, asistencia)`

export default function MiCuenta() {
  const { perfil, hoy } = useSesion()
  const { datos, cargando, error, recargar } = useDatos(async () => {
    await rpc('mantenimiento')   // vence pendientes y ofrece lugares liberados
    const [reservas, creditos, espera] = await Promise.all([
      q(supabase.from('reservas').select(SELECT_RESERVA).order('creada_en', { ascending: false })),
      q(supabase.from('creditos').select('id, monto, saldo, temporada, reserva:reservas(codigo)').order('creado_en')),
      q(supabase.from('lista_espera').select('id, estado, cantidad, vence_en, reserva_id, creado_en, turno:turnos(fecha, hora_inicio, producto:productos(nombre), centro:centros(nombre))').in('estado', ['esperando', 'ofrecida']).order('creado_en')),
    ])
    return { reservas, creditos, espera }
  })

  if (cargando) return <Cargando />
  if (error) return <Pagina><ErrorAccion error={error} onActualizar={recargar} /></Pagina>

  const { reservas, creditos, espera } = datos
  const resolver = reservas.filter((r) => (r.estado === 'afectada_clima' && !r.opcion_clima) || r.estado === 'pendiente_pago')
  const proximas = reservas.filter((r) => ['confirmada', 'en_curso', 'solicitud'].includes(r.estado) && r.turno?.fecha >= hoy)
    .sort((a, b) => (a.turno.fecha + a.turno.hora_inicio).localeCompare(b.turno.fecha + b.turno.hora_inicio))
  const historial = reservas.filter((r) => !resolver.includes(r) && !proximas.includes(r))
  const saldo = creditos.reduce((a, c) => a + c.saldo, 0)

  return (
    <Pagina ancho="max-w-3xl">
      <Titulo sub={`Hola, ${perfil?.nombre?.split(' ')[0]}`} accion={<BotonLink to="/#clases">Reservar</BotonLink>}>Mi cuenta</Titulo>

      {espera.length > 0 && (
        <Seccion titulo="Lista de espera">
          <div className="space-y-2">
            {espera.map((e) => (
              <Tarjeta key={e.id} className={e.estado === 'ofrecida' ? 'ring-2 ring-alerta' : ''}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{e.turno.producto.nombre} · {e.turno.centro.nombre}</p>
                  <Estado estado={e.estado} />
                </div>
                <p className="text-pizarra/80">{fechaLarga(e.turno.fecha)}, {hora(e.turno.hora_inicio)} · {personas(e.cantidad)}</p>
                {e.estado === 'ofrecida' ? (
                  <Aviso tipo="alerta" className="mt-2" titulo="¡Se liberó un lugar!">
                    Tienes hasta el {momento(e.vence_en)} para pagar y confirmar. <Link className="font-bold underline" to={`/mi-cuenta/reservas/${e.reserva_id}`}>Ver la reserva</Link>
                  </Aviso>
                ) : (
                  <p className="mt-1 flex items-center gap-1 text-sm text-pizarra/70"><Hourglass className="size-4" /> Te avisamos aquí si se libera un lugar (por orden de llegada).</p>
                )}
              </Tarjeta>
            ))}
          </div>
        </Seccion>
      )}

      {resolver.length > 0 && (
        <Seccion titulo="Para resolver">
          <div className="space-y-2">{resolver.map((r) => <FilaReserva key={r.id} r={r} destacar />)}</div>
        </Seccion>
      )}

      <Seccion titulo="Próximas clases">
        {proximas.length ? <div className="space-y-2">{proximas.map((r) => <FilaReserva key={r.id} r={r} />)}</div>
          : <Vacio>No tienes clases próximas. <Link className="font-semibold text-cielo" to="/#clases">Reserva una</Link>.</Vacio>}
      </Seccion>

      {saldo > 0 && (
        <Seccion titulo={`Mis créditos · ${precio(saldo)}`}>
          <Tarjeta>
            <p className="mb-1 flex items-center gap-2 text-sm text-pizarra/70"><Wallet className="size-4" /> Se usan en otra reserva de la misma temporada.</p>
            {creditos.map((c) => (
              <div key={c.id} className="flex justify-between border-b border-glaciar/10 py-2 last:border-0">
                <span>Temporada {c.temporada} · por cierre por clima de {c.reserva?.codigo}</span>
                <span className="font-semibold">{precio(c.saldo)} <span className="font-normal text-pizarra/60">de {precio(c.monto)}</span></span>
              </div>
            ))}
          </Tarjeta>
        </Seccion>
      )}

      {historial.length > 0 && (
        <Seccion titulo="Historial">
          <div className="space-y-2">{historial.map((r) => <FilaReserva key={r.id} r={r} />)}</div>
        </Seccion>
      )}
    </Pagina>
  )
}

function FilaReserva({ r, destacar }) {
  const clima = r.estado === 'afectada_clima' && !r.opcion_clima
  return (
    <Link to={`/mi-cuenta/reservas/${r.id}`}
      className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 transition hover:ring-cielo ${destacar ? 'ring-2 ring-alerta' : 'ring-glaciar/10'}`}>
      <div className="w-14 shrink-0 rounded-xl bg-hielo py-1 text-center">
        <p className="titulo text-2xl font-bold leading-none text-glaciar">{r.turno ? aFecha(r.turno.fecha).getDate() : '–'}</p>
        <p className="text-xs uppercase text-glaciar/70">{r.turno ? new Date(r.turno.fecha + 'T12:00').toLocaleDateString('es-CL', { month: 'short' }).replace('.', '') : ''}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{r.producto.nombre}</p>
        <p className="truncate text-sm text-pizarra/70">{r.turno?.centro?.nombre} · {hora(r.turno?.hora_inicio)} · {personas(r.participantes.length)} · {r.codigo}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Estado estado={r.estado} />
          {clima && <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#b34a0f]"><CloudSnow className="size-4" /> Elige reprogramar o crédito</span>}
          {r.estado === 'pendiente_pago' && <span className="text-sm text-pizarra/70">Paga antes del {momento(r.vence_en)}</span>}
          {r.opcion_clima && <span className="text-sm text-pizarra/70">{r.opcion_clima === 'credito' ? 'Pasó a crédito' : 'Reprogramada'}</span>}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-pizarra/40" />
    </Link>
  )
}
