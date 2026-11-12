import { Link } from 'react-router-dom'
import { Users, User, Baby, Compass, Helicopter, Briefcase, Snowflake, MapPin, CalendarDays, ShieldCheck, ChevronRight, Mountain } from 'lucide-react'
import { rpc } from '../../lib/supabase'
import { precio, fecha, fechaCorta } from '../../lib/formato'
import { Cumbres } from '../../components/Cumbres'
import { useDatos, Cargando, ErrorAccion, BotonLink } from '../../components/ui'

export const ICONO_TIPO = { grupal: Users, particular: User, chicos: Baby, guiada: Compass, heliesqui: Helicopter, corporativa: Briefcase }

export const textoPrecio = (p) =>
  `${p.a_pedido ? 'Desde ' : ''}${precio(p.precio)} ${p.precio_por === 'persona' ? 'por persona' : p.precio_por === 'clase' ? 'por clase' : 'por grupo'}`

export default function Inicio() {
  const { datos, cargando, error, recargar } = useDatos(async () => {
    const [productos, temporada, centros] = await Promise.all([rpc('catalogo_productos'), rpc('temporada_publica'), rpc('catalogo_centros')])
    return { productos, temporada: temporada?.[0], centros }
  })

  return (
    <>
      <section className="cielo-alto relative overflow-hidden text-white">
        <div className="mx-auto max-w-6xl px-4 pb-40 pt-10 sm:pt-16">
          <p className="titulo flex items-center gap-2 text-lg font-semibold uppercase tracking-widest text-hielo/90">
            <Snowflake className="size-5" aria-hidden /> Temporada {datos?.temporada ? new Date(datos.temporada.temporada_inicio).getFullYear() : ''}
          </p>
          <h1 className="mt-2 max-w-2xl text-5xl font-bold uppercase leading-[0.95] sm:text-7xl">Aprende a bajar con confianza</h1>
          <p className="mt-4 max-w-xl text-lg text-hielo">
            Clases de esquí y snowboard en tres centros de la cordillera, a una hora de Santiago. Grupos de hasta 6 personas del mismo nivel, instructores certificados y traslado desde Lo Barnechea.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#clases" className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-white px-6 text-lg font-bold text-glaciar">
              Ver clases <ChevronRight className="size-5" />
            </a>
            <Link to="/ingresar" className="inline-flex min-h-14 items-center rounded-xl border-2 border-white/70 px-6 text-lg font-semibold">
              Mis reservas
            </Link>
          </div>
        </div>
        <Cumbres className="absolute bottom-0 left-0 h-40 w-full sm:h-52" />
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-10">
        {cargando && <Cargando />}
        <ErrorAccion error={error} onActualizar={recargar} />
        {datos && (
          <>
            <section id="clases" className="scroll-mt-4">
              <h2 className="text-3xl font-bold uppercase text-glaciar">Elige tu clase</h2>
              <p className="text-pizarra/70">Precios en pesos chilenos. En vacaciones de invierno ({fechaCorta(datos.temporada.alta_inicio)} al {fechaCorta(datos.temporada.alta_fin)}) las clases tienen un recargo de {datos.temporada.recargo_alta_pct}%; los extras no.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {datos.productos.map((p) => {
                  const Icono = ICONO_TIPO[p.tipo] || Mountain
                  return (
                    <Link key={p.id} to={`/productos/${p.codigo}`}
                      className="group flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-glaciar/10 transition hover:-translate-y-0.5 hover:shadow-md">
                      <span className="mb-3 inline-flex size-12 items-center justify-center rounded-xl bg-hielo text-glaciar">
                        <Icono className="size-7" aria-hidden />
                      </span>
                      <h3 className="text-2xl font-bold uppercase leading-tight text-glaciar">{p.nombre}</h3>
                      <p className="mt-1 flex-1 text-pizarra/80">{p.descripcion}</p>
                      <p className="mt-3 text-lg font-bold text-pizarra">{textoPrecio(p)}</p>
                      <p className="text-sm text-pizarra/60">
                        {p.a_pedido ? 'Se cotiza a pedido' : `${p.duracion_horas} h · hasta ${p.cupo} ${p.precio_por === 'persona' ? 'por grupo' : 'personas'}`}
                      </p>
                      <span className="mt-3 inline-flex items-center gap-1 font-semibold text-cielo group-hover:underline">
                        {p.a_pedido ? 'Pedir cotización' : 'Ver horarios'} <ChevronRight className="size-4" />
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>

            <section className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                [CalendarDays, '1. Reserva', `Elige fecha, centro y horario. Tu lugar queda guardado ${datos.temporada.horas_pago} horas mientras registramos tu pago.`],
                [ShieldCheck, '2. Paga y listo', 'Transfiere o paga en nuestra base. Cuando registramos el pago, tu reserva queda confirmada.'],
                [Mountain, '3. A la nieve', 'Llega al punto de encuentro 15 minutos antes. Si el centro cierra por clima, eliges reprogramar o crédito del 100%.'],
              ].map(([Icono, t, d]) => (
                <div key={t} className="rounded-2xl bg-white p-5 ring-1 ring-glaciar/10">
                  <Icono className="size-8 text-cielo" aria-hidden />
                  <h3 className="mt-2 text-2xl font-bold uppercase text-glaciar">{t}</h3>
                  <p className="text-pizarra/80">{d}</p>
                </div>
              ))}
            </section>

            <section className="mt-10 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-glaciar p-5 text-white">
                <h2 className="text-2xl font-bold uppercase">Centros y puntos de encuentro</h2>
                <ul className="mt-3 space-y-3">
                  {datos.centros.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <MapPin className="mt-0.5 size-5 shrink-0 text-hielo" aria-hidden />
                      <div><p className="font-bold">{c.nombre}</p><p className="text-hielo/90">{c.punto_encuentro}</p></div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl bg-white p-5 ring-1 ring-glaciar/10">
                <h2 className="text-2xl font-bold uppercase text-glaciar">Bueno saber</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-pizarra/90">
                  <li>Temporada del {fecha(datos.temporada.temporada_inicio)} al {fecha(datos.temporada.temporada_fin)}.</li>
                  <li>La edad mínima para tomar clases es de {datos.temporada.edad_minima} años.</li>
                  <li>Si cancelas con más de 72 horas, te devolvemos el {datos.temporada.reintegro_mas_72_pct}%; entre 72 y 24 horas, el {datos.temporada.reintegro_24_72_pct}%; con menos de 24 horas no hay devolución.</li>
                  <li>Heliesquí y jornadas para empresas se cotizan: envía tu solicitud y te respondemos con el precio.</li>
                </ul>
                <BotonLink to="/productos/grupal_medio" className="mt-4">Reservar una clase grupal</BotonLink>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  )
}
