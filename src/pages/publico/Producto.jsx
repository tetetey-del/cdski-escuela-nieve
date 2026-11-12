import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { rpc } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { fechaLarga, hora, nivel, disciplina, sumarDias } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, Cargando, ErrorAccion, BotonLink, Cupo, Tarjeta, Aviso, Vacio } from '../../components/ui'
import { ICONO_TIPO, textoPrecio } from './Inicio'

export function primerDiaReservable(temporada, hoy) {
  const manana = sumarDias(hoy, 1)
  if (manana < temporada.temporada_inicio) return temporada.temporada_inicio
  return manana > temporada.temporada_fin ? temporada.temporada_fin : manana
}

export default function Producto() {
  const { codigo } = useParams()
  const { hoy } = useSesion()
  const [dia, setDia] = useState(null)

  const base = useDatos(async () => {
    const [productos, temporada] = await Promise.all([rpc('catalogo_productos'), rpc('temporada_publica')])
    return { producto: productos.find((p) => p.codigo === codigo), temporada: temporada[0] }
  }, [codigo])
  const p = base.datos?.producto
  const t = base.datos?.temporada
  const fechaSel = dia || (t ? primerDiaReservable(t, hoy) : null)

  const disp = useDatos(async () => (p && !p.a_pedido ? rpc('disponibilidad', { p_producto: p.id, p_fecha: fechaSel }) : []), [p?.id, fechaSel])

  if (base.cargando) return <Cargando />
  if (base.error) return <Pagina><ErrorAccion error={base.error} onActualizar={base.recargar} /></Pagina>
  if (!p) return <Pagina><Aviso tipo="alerta">Esa clase no existe.</Aviso></Pagina>
  const Icono = ICONO_TIPO[p.tipo]

  // agrupa por centro
  const porCentro = {}
  for (const f of disp.datos || []) (porCentro[f.centro] ||= []).push(f)

  return (
    <Pagina>
      <div className="flex items-start gap-4">
        <span className="hidden size-16 shrink-0 items-center justify-center rounded-2xl bg-glaciar text-white sm:inline-flex"><Icono className="size-9" /></span>
        <div>
          <h1 className="text-4xl font-bold uppercase leading-none text-glaciar">{p.nombre}</h1>
          <p className="mt-2 max-w-2xl text-lg">{p.descripcion}</p>
          <p className="mt-2 text-lg font-bold text-pizarra">{textoPrecio(p)}</p>
        </div>
      </div>

      {p.a_pedido ? (
        <Tarjeta className="mt-6 max-w-xl">
          <h2 className="text-2xl font-bold uppercase text-glaciar">Se cotiza a pedido</h2>
          <p className="mt-1">
            Envía tu solicitud con la fecha, el centro y las personas. Operaciones la cotiza y te avisa: recién ahí pasa a pendiente de pago.
            {p.tipo === 'heliesqui' && ' El heliesquí exige nivel Experto declarado y queda sujeto a confirmar el clima el día anterior.'}
          </p>
          <BotonLink to={`/reservar/${p.codigo}`} grande className="mt-4">Pedir cotización</BotonLink>
        </Tarjeta>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button className="rounded-xl bg-white p-3 ring-1 ring-glaciar/20 disabled:opacity-40" aria-label="Día anterior"
                disabled={fechaSel <= t.temporada_inicio} onClick={() => setDia(sumarDias(fechaSel, -1))}><ChevronLeft /></button>
              <input type="date" value={fechaSel} min={t.temporada_inicio} max={t.temporada_fin}
                onChange={(e) => e.target.value && setDia(e.target.value)}
                className="min-h-12 rounded-xl border-2 border-glaciar/20 bg-white px-3 font-semibold" aria-label="Fecha" />
              <button className="rounded-xl bg-white p-3 ring-1 ring-glaciar/20 disabled:opacity-40" aria-label="Día siguiente"
                disabled={fechaSel >= t.temporada_fin} onClick={() => setDia(sumarDias(fechaSel, 1))}><ChevronRight /></button>
            </div>
            <BotonLink to={`/reservar/${p.codigo}?fecha=${fechaSel}`} grande>Reservar</BotonLink>
          </div>
          <h2 className="mt-4 text-2xl font-bold uppercase text-glaciar">{fechaLarga(fechaSel)}</h2>
          {fechaSel <= hoy && <Aviso className="mt-2">Ese día ya pasó o es hoy: elige una fecha desde mañana para reservar.</Aviso>}
          {disp.cargando ? <Cargando /> : (
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              {Object.keys(porCentro).length === 0 && <Vacio>No hay horarios para este día.</Vacio>}
              {Object.entries(porCentro).map(([centro, filas]) => (
                <Tarjeta key={centro}>
                  <h3 className="text-xl font-bold uppercase text-glaciar">{centro}</h3>
                  <ul className="mt-2 divide-y divide-glaciar/10">
                    {filas.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 py-2">
                        <span>
                          <span className="font-bold">{hora(f.hora_inicio)}–{hora(f.hora_fin)}</span>{' '}
                          {f.nivel && <span className="text-pizarra/80">· {disciplina(f.disciplina)} · {nivel(f.nivel)}{f.grupo > 1 ? ` · grupo ${f.grupo}` : ''}</span>}
                          {!f.nivel && <span className="text-pizarra/80">· {f.libres} {f.libres === 1 ? 'instructor libre' : 'instructores libres'}</span>}
                        </span>
                        <Cupo etiqueta={f.etiqueta} libres={f.nivel ? f.libres : null} />
                      </li>
                    ))}
                  </ul>
                </Tarjeta>
              ))}
            </div>
          )}
        </>
      )}
    </Pagina>
  )
}
