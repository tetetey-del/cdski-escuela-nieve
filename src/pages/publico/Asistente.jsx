import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, ChevronLeft, ChevronRight, Split, CalendarPlus, Share2, Hourglass } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, fechaLarga, hora, nivel, disciplina, NIVELES, momento } from '../../lib/formato'
import { leerError } from '../../lib/errores'
import { descargarIcs, linkWhatsapp, textoReserva } from '../../lib/avisos'
import { Pagina } from '../../components/Layout'
import { useDatos, Cargando, ErrorAccion, Boton, Tarjeta, Aviso, Campo, entrada, Cupo, Estado, Dato, Vacio } from '../../components/ui'
import { primerDiaReservable } from './Producto'

const PASOS = ['Personas', 'Fecha y turno', 'Extras', 'Confirmar']
const personaVacia = (nivelDef = 'principiante') => ({ nombre: '', edad: '', nivel: nivelDef, equipo: false, ropa: false, traslado: false })
const clave = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

export default function Asistente() {
  const { codigo } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { usuario, rol, hoy } = useSesion()
  const KEY = `asistente:${codigo}`

  const base = useDatos(async () => {
    const [productos, temporada, centros, extras] = await Promise.all([
      rpc('catalogo_productos'), rpc('temporada_publica'), rpc('catalogo_centros'), rpc('catalogo_extras'),
    ])
    return { p: productos.find((x) => x.codigo === codigo), t: temporada[0], centros, extras }
  }, [codigo])
  const { p, t, centros, extras } = base.datos || {}

  // Estado del asistente: queda guardado en la pestaña por si hay que ingresar a mitad de camino
  const [s, setS] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(KEY)) || null } catch { return null }
  })
  useEffect(() => {
    if (p && t && !s) {
      setS({
        paso: 0, personas: [personaVacia(p.niveles_permitidos[0])], fecha: params.get('fecha') || primerDiaReservable(t, hoy),
        disciplina: p.disciplina === 'ambas' ? 'esqui' : p.disciplina, idioma: 'es', turno: null, centro_id: centros[0]?.id,
        usarCredito: false, notas: '', clave: clave(), resultado: null,
      })
    }
  }, [p, t, s, centros, params, hoy])
  useEffect(() => { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)) }, [s, KEY])
  const set = (cambios) => setS((x) => ({ ...x, ...cambios }))

  const [division, setDivision] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`division:${codigo}`)) } catch { return null }
  })

  if (base.cargando || (p && !s)) return <Cargando />
  if (base.error) return <Pagina><ErrorAccion error={base.error} onActualizar={base.recargar} /></Pagina>
  if (!p) return <Pagina><Aviso tipo="alerta">Esa clase no existe.</Aviso></Pagina>
  if (rol && rol !== 'cliente') return <Pagina><Aviso>Las reservas se hacen con una cuenta de cliente. Ingresaste como {rol}.</Aviso></Pagina>

  const reiniciar = (personas) => {
    sessionStorage.removeItem(KEY)
    setS({
      paso: 0, personas: personas || [personaVacia(p.niveles_permitidos[0])], fecha: s.fecha, disciplina: s.disciplina,
      idioma: 'es', turno: null, centro_id: s.centro_id, usarCredito: false, notas: '', clave: clave(), resultado: null,
    })
  }

  if (s.resultado) {
    return <Resultado p={p} s={s} centros={centros} division={division}
      onDivision={() => {
        sessionStorage.removeItem(`division:${codigo}`)
        const resto = division; setDivision(null); reiniciar(resto)
      }}
      onOtra={() => reiniciar()} />
  }

  return (
    <Pagina ancho="max-w-3xl">
      <Link to={`/productos/${p.codigo}`} className="inline-flex items-center gap-1 font-semibold text-cielo"><ChevronLeft className="size-4" /> {p.nombre}</Link>
      <h1 className="mt-1 text-4xl font-bold uppercase text-glaciar">{p.a_pedido ? 'Pedir cotización' : 'Reservar'}</h1>
      <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="Pasos">
        {PASOS.map((nombre, i) => (
          <li key={nombre} className={`rounded-lg px-2 py-2 text-center text-sm font-semibold ${i === s.paso ? 'bg-glaciar text-white' : i < s.paso ? 'bg-cielo/20 text-glaciar' : 'bg-white text-pizarra/60'}`}
            aria-current={i === s.paso ? 'step' : undefined}>
            <span className="titulo text-lg">{i + 1}</span><span className="hidden sm:inline"> · {nombre}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        {s.paso === 0 && <PasoPersonas p={p} t={t} s={s} set={set} onDividir={(resto) => {
          sessionStorage.setItem(`division:${codigo}`, JSON.stringify(resto)); setDivision(resto)
        }} />}
        {s.paso === 1 && <PasoTurno p={p} t={t} s={s} set={set} centros={centros} hoy={hoy} usuario={usuario} codigo={codigo} />}
        {s.paso === 2 && <PasoExtras p={p} s={s} set={set} extras={extras} usuario={usuario} />}
        {s.paso === 3 && <PasoConfirmar p={p} t={t} s={s} set={set} extras={extras} centros={centros} usuario={usuario}
          irAIngresar={() => nav(`/ingresar?volver=${encodeURIComponent(`/reservar/${codigo}`)}`)} />}
      </div>
    </Pagina>
  )
}

// ---------------- Paso 1: personas ----------------
function errorPersona(per, p, t) {
  if (!per.nombre.trim()) return 'Falta el nombre'
  if (per.edad === '' || per.edad == null) return 'Falta la edad'
  const e = Number(per.edad)
  if (e < t.edad_minima) return `La edad mínima para tomar clases en la escuela es ${t.edad_minima} años.`
  if (p.edad_min && (e < p.edad_min || e > p.edad_max)) return `Este programa es para chicos de ${p.edad_min} a ${p.edad_max} años.`
  if (!p.niveles_permitidos.includes(per.nivel)) return `Esta clase es solo para nivel ${p.niveles_permitidos.map(nivel).join(' o ')}.`
  return null
}

function PasoPersonas({ p, t, s, set, onDividir }) {
  const [intentado, setIntentado] = useState(false)
  const pers = s.personas
  const cambiar = (i, k, v) => set({ personas: pers.map((x, j) => (j === i ? { ...x, [k]: v } : x)), turno: null })
  const errores = pers.map((x) => errorPersona(x, p, t))
  const niveles = [...new Set(pers.map((x) => x.nivel))]
  const mezclados = p.tipo !== 'corporativa' && niveles.length > 1
  const max = p.cupo
  const faltan = pers.length < p.min_personas
  const ok = !errores.some(Boolean) && !mezclados && !faltan

  // Propuesta de división: se queda el nivel con más personas, el resto pasa a una segunda reserva
  const dividir = () => {
    const conteo = niveles.map((n) => [n, pers.filter((x) => x.nivel === n).length]).sort((a, b) => b[1] - a[1])
    const queda = conteo[0][0]
    onDividir(pers.filter((x) => x.nivel !== queda))
    set({ personas: pers.filter((x) => x.nivel === queda), turno: null })
  }

  return (
    <div className="space-y-3">
      <p className="text-pizarra/80">
        Agrega a cada persona que va a tomar la clase. {p.tipo !== 'corporativa' && 'Todas tienen que tener el mismo nivel.'} {p.precio_por !== 'persona' && `El precio es por ${p.precio_por}.`}
      </p>
      {pers.map((x, i) => (
        <Tarjeta key={i} className={intentado && errores[i] ? 'ring-2 ring-alerta' : ''}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold uppercase text-glaciar">Persona {i + 1}</h2>
            {pers.length > 1 && (
              <button onClick={() => set({ personas: pers.filter((_, j) => j !== i), turno: null })} className="rounded-lg p-2 text-pizarra/70 hover:bg-hielo" aria-label={`Quitar persona ${i + 1}`}>
                <Trash2 className="size-5" />
              </button>
            )}
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_7rem_11rem]">
            <Campo etiqueta="Nombre y apellido"><input className={entrada} value={x.nombre} onChange={(e) => cambiar(i, 'nombre', e.target.value)} /></Campo>
            <Campo etiqueta="Edad"><input className={entrada} type="number" inputMode="numeric" min="1" max="99" value={x.edad} onChange={(e) => cambiar(i, 'edad', e.target.value)} /></Campo>
            <Campo etiqueta="Nivel">
              <select className={entrada} value={x.nivel} onChange={(e) => cambiar(i, 'nivel', e.target.value)}>
                {NIVELES.map((n) => <option key={n} value={n} disabled={!p.niveles_permitidos.includes(n)}>{nivel(n)}</option>)}
              </select>
            </Campo>
          </div>
          {(intentado || (x.edad !== '' && Number(x.edad) < t.edad_minima)) && errores[i] && (
            <p className="mt-2 font-semibold text-[#b34a0f]" role="alert">{errores[i]}</p>
          )}
        </Tarjeta>
      ))}
      {pers.length < max && (
        <Boton variante="suave" onClick={() => set({ personas: [...pers, personaVacia(pers[0]?.nivel)], turno: null })}>
          <Plus className="size-5" /> Agregar persona
        </Boton>
      )}
      <p className="text-sm text-pizarra/60">Hasta {max} personas{p.min_personas > 1 ? `, mínimo ${p.min_personas}` : ''}.</p>
      {mezclados && (
        <Aviso tipo="alerta" titulo="Hay niveles distintos">
          <p>En una reserva de {p.nombre.toLowerCase()} todas las personas tienen que tener el mismo nivel ({niveles.map(nivel).join(' y ')}). Te proponemos dividirla en dos reservas: primero reservas un nivel y después el otro.</p>
          <Boton variante="secundario" className="mt-2" onClick={dividir}><Split className="size-5" /> Dividir en dos reservas</Boton>
        </Aviso>
      )}
      {faltan && intentado && <Aviso tipo="alerta">Esta actividad necesita al menos {p.min_personas} personas.</Aviso>}
      <div className="flex justify-end pt-2">
        <Boton grande onClick={() => { setIntentado(true); if (ok) set({ paso: 1 }) }}>Siguiente <ChevronRight className="size-5" /></Boton>
      </div>
    </div>
  )
}

// ---------------- Paso 2: fecha y turno ----------------
function PasoTurno({ p, t, s, set, centros, hoy, usuario, codigo }) {
  const n = s.personas.length
  const nivelGrupo = s.personas[0].nivel
  const disp = useDatos(async () => (p.a_pedido ? [] : rpc('disponibilidad', { p_producto: p.id, p_fecha: s.fecha })), [s.fecha])
  const [espera, setEspera] = useState({ cargando: false, error: null, ok: null })
  const nav = useNavigate()

  const filas = (disp.datos || []).filter((f) =>
    p.tipo === 'grupal' || p.tipo === 'chicos' ? f.nivel === nivelGrupo && f.disciplina === s.disciplina : true)
  const porCentro = {}
  for (const f of filas) (porCentro[f.centro] ||= []).push(f)

  const anotarEspera = async (f) => {
    if (!usuario) { nav(`/ingresar?volver=${encodeURIComponent(`/reservar/${codigo}`)}`); return }
    setEspera({ cargando: true, error: null, ok: null })
    try {
      const r = await rpc('unirse_lista_espera', { p_turno: f.turno_id, p_personas: s.personas })
      setEspera({ cargando: false, error: null, ok: `Quedaste en la lista de espera (posición ${r.posicion}). Si se libera un lugar, te ofrecemos la reserva y tienes 12 horas para confirmarla. Lo vas a ver en Mi cuenta.` })
    } catch (e) { setEspera({ cargando: false, error: e, ok: null }) }
  }

  const fechaInvalida = s.fecha <= hoy || s.fecha < t.temporada_inicio || s.fecha > t.temporada_fin

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha" error={fechaInvalida ? 'Elige una fecha desde mañana y dentro de la temporada.' : null}>
          <input type="date" className={entrada} value={s.fecha} min={t.temporada_inicio} max={t.temporada_fin}
            onChange={(e) => e.target.value && set({ fecha: e.target.value, turno: null })} />
        </Campo>
        {p.disciplina === 'ambas' && p.tipo !== 'corporativa' && (
          <Campo etiqueta="Disciplina">
            <select className={entrada} value={s.disciplina} onChange={(e) => set({ disciplina: e.target.value, turno: null })}>
              <option value="esqui">Esquí</option><option value="snowboard">Snowboard</option>
            </select>
          </Campo>
        )}
        {p.a_pedido && (
          <Campo etiqueta="Centro">
            <select className={entrada} value={s.centro_id} onChange={(e) => set({ centro_id: Number(e.target.value) })}>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Campo>
        )}
      </div>
      <p className="font-semibold text-glaciar">{fechaLarga(s.fecha)} · {n} {n === 1 ? 'persona' : 'personas'} · nivel {nivel(nivelGrupo)}</p>

      {!p.a_pedido && (disp.cargando ? <Cargando texto="Buscando turnos…" /> : (
        <div className="grid gap-3 md:grid-cols-3">
          {filas.length === 0 && <Vacio>No hay turnos para ese día.</Vacio>}
          {Object.entries(porCentro).map(([centro, lista]) => (
            <Tarjeta key={centro} className="p-3">
              <h3 className="text-xl font-bold uppercase text-glaciar">{centro}</h3>
              <div className="mt-2 space-y-2">
                {lista.map((f, i) => {
                  const alcanza = !f.cerrado_clima && f.libres >= (f.nivel ? n : 1)
                  const elegido = s.turno && s.turno.centro_id === f.centro_id && s.turno.hora_inicio === f.hora_inicio && s.turno.grupo === f.grupo
                  return (
                    <div key={i} className={`rounded-xl p-2 ring-1 ${elegido ? 'bg-hielo ring-2 ring-glaciar' : 'ring-glaciar/15'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-lg font-bold">{hora(f.hora_inicio)}–{hora(f.hora_fin)}</span>
                        <Cupo etiqueta={f.etiqueta} libres={f.nivel ? f.libres : null} />
                      </div>
                      {f.grupo > 1 && <p className="text-sm text-pizarra/70">Grupo {f.grupo}</p>}
                      {alcanza ? (
                        <Boton bloque className="mt-2" variante={elegido ? 'primario' : 'secundario'} disabled={fechaInvalida}
                          onClick={() => set({ turno: f })}>{elegido ? 'Elegido' : 'Elegir'}</Boton>
                      ) : f.turno_id && !f.cerrado_clima && f.nivel ? (
                        <Boton bloque className="mt-2" variante="suave" disabled={fechaInvalida} cargando={espera.cargando} onClick={() => anotarEspera(f)}>
                          <Hourglass className="size-4" /> {f.libres > 0 ? `Quedan ${f.libres}: lista de espera` : 'Lista de espera'}
                        </Boton>
                      ) : (
                        <p className="mt-2 text-sm text-pizarra/70">{f.cerrado_clima ? 'Centro cerrado por clima' : 'Sin instructores libres'}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </Tarjeta>
          ))}
        </div>
      ))}
      <ErrorAccion error={espera.error} onActualizar={disp.recargar} />
      {espera.ok && <Aviso tipo="ok" titulo="Listo">{espera.ok}</Aviso>}

      <div className="flex justify-between pt-2">
        <Boton variante="secundario" onClick={() => set({ paso: 0 })}><ChevronLeft className="size-5" /> Atrás</Boton>
        <Boton grande disabled={fechaInvalida || (!p.a_pedido && !s.turno)} onClick={() => set({ paso: 2 })}>Siguiente <ChevronRight className="size-5" /></Boton>
      </div>
    </div>
  )
}

// ---------------- Paso 3: extras ----------------
function PasoExtras({ p, s, set, extras, usuario }) {
  const anio = Number(s.fecha.slice(0, 4))
  const creditos = useDatos(async () => {
    if (!usuario) return 0
    const { data } = await supabase.from('creditos').select('saldo').eq('temporada', anio).gt('saldo', 0)
    return (data || []).reduce((a, c) => a + c.saldo, 0)
  }, [usuario?.id, anio])
  const cambiar = (i, k, v) => set({ personas: s.personas.map((x, j) => (j === i ? { ...x, [k]: v } : x)) })
  const ex = Object.fromEntries(extras.map((e) => [e.codigo, e]))

  return (
    <div className="space-y-4">
      <p className="text-pizarra/80">Extras por persona y por día. El arriendo y el traslado los coordinamos con nuestros proveedores.</p>
      {s.personas.map((x, i) => (
        <Tarjeta key={i} className="p-3">
          <p className="font-bold">{x.nombre} <span className="font-normal text-pizarra/70">· {x.edad} años · {nivel(x.nivel)}</span></p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {['equipo', 'ropa', 'traslado'].map((k) => (
              <label key={k} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 ring-1 ${x[k] ? 'bg-hielo ring-glaciar' : 'ring-glaciar/15'}`}>
                <input type="checkbox" className="size-5 accent-[#0B3C5D]" checked={x[k]} onChange={(e) => cambiar(i, k, e.target.checked)} />
                <span><span className="font-semibold">{ex[k]?.nombre}</span><br /><span className="text-sm text-pizarra/70">{precio(ex[k]?.precio)}</span></span>
              </label>
            ))}
          </div>
        </Tarjeta>
      ))}
      {(p.tipo === 'particular' || p.tipo === 'guiada') && (
        <Campo etiqueta="Idioma de la clase" ayuda="Las clases en inglés las dan instructores bilingües.">
          <select className={entrada} value={s.idioma} onChange={(e) => set({ idioma: e.target.value })}>
            <option value="es">Español</option><option value="en">Inglés</option>
          </select>
        </Campo>
      )}
      {!p.a_pedido && creditos.datos > 0 && (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-ok/10 px-3 ring-1 ring-ok">
          <input type="checkbox" className="size-5 accent-[#2E9E6B]" checked={s.usarCredito} onChange={(e) => set({ usarCredito: e.target.checked })} />
          <span><span className="font-semibold">Usar mi crédito</span> · tienes {precio(creditos.datos)} disponibles para esta temporada</span>
        </label>
      )}
      <Campo etiqueta="Comentarios (opcional)">
        <textarea className={entrada} rows={2} value={s.notas} onChange={(e) => set({ notas: e.target.value })}
          placeholder={p.tipo === 'corporativa' ? 'Empresa, objetivo de la jornada, necesidades especiales…' : 'Algo que el instructor deba saber'} />
      </Campo>
      <div className="flex justify-between pt-2">
        <Boton variante="secundario" onClick={() => set({ paso: 1 })}><ChevronLeft className="size-5" /> Atrás</Boton>
        <Boton grande onClick={() => set({ paso: 3 })}>Siguiente <ChevronRight className="size-5" /></Boton>
      </div>
    </div>
  )
}

// ---------------- Paso 4: confirmar ----------------
export function calcularPrecio(p, t, fecha, personas, extras) {
  const n = personas.length
  const base = p.precio_por === 'persona' ? p.precio * n : p.precio
  const alta = fecha >= t.alta_inicio && fecha <= t.alta_fin
  const recargo = alta ? Math.round((base * t.recargo_alta_pct) / 100) : 0
  const ex = Object.fromEntries(extras.map((e) => [e.codigo, e.precio]))
  const montoExtras = personas.reduce((a, x) => a + (x.equipo ? ex.equipo : 0) + (x.ropa ? ex.ropa : 0) + (x.traslado ? ex.traslado : 0), 0)
  return { base, alta, recargo, montoExtras, total: base + recargo + montoExtras }
}

function PasoConfirmar({ p, t, s, set, extras, centros, usuario, irAIngresar }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const c = calcularPrecio(p, t, s.fecha, s.personas, extras)
  const centro = p.a_pedido ? centros.find((x) => x.id === s.centro_id) : centros.find((x) => x.id === s.turno.centro_id)
  const e = error && leerError(error)

  const confirmar = async () => {
    if (!usuario) { irAIngresar(); return }
    setEnviando(true); setError(null)
    try {
      const personas = s.personas.map((x) => ({ ...x, edad: Number(x.edad), nombre: x.nombre.trim() }))
      const r = p.a_pedido
        ? await rpc('crear_solicitud', { p_producto: p.id, p_centro: s.centro_id, p_fecha: s.fecha, p_personas: personas, p_notas: s.notas, p_clave: s.clave })
        : await rpc('crear_reserva', {
            p_producto: p.id, p_centro: s.turno.centro_id, p_fecha: s.fecha, p_hora: s.turno.hora_inicio,
            p_disciplina: s.turno.disciplina || s.disciplina, p_personas: personas, p_idioma: s.idioma,
            p_usar_credito: s.usarCredito, p_notas: s.notas, p_clave: s.clave, p_grupo: s.turno.grupo,
          })
      set({ resultado: { ...r, centro: centro?.nombre, punto: centro?.punto_encuentro, total_estimado: c.total } })
    } catch (err) { setError(err) } finally { setEnviando(false) }
  }

  return (
    <div className="space-y-4">
      <Tarjeta>
        <h2 className="text-2xl font-bold uppercase text-glaciar">{p.nombre}</h2>
        <dl className="mt-2">
          <Dato etiqueta="Fecha">{fechaLarga(s.fecha)}</Dato>
          <Dato etiqueta="Centro">{centro?.nombre}</Dato>
          {!p.a_pedido && <Dato etiqueta="Horario">{hora(s.turno.hora_inicio)} a {hora(s.turno.hora_fin)}</Dato>}
          {p.disciplina === 'ambas' && p.tipo !== 'corporativa' && <Dato etiqueta="Disciplina">{disciplina(s.turno?.disciplina || s.disciplina)}</Dato>}
          <Dato etiqueta="Personas">{s.personas.map((x) => x.nombre).join(', ')}</Dato>
          <Dato etiqueta="Nivel">{[...new Set(s.personas.map((x) => nivel(x.nivel)))].join(', ')}</Dato>
          <Dato etiqueta="Punto de encuentro">{centro?.punto_encuentro}</Dato>
        </dl>
      </Tarjeta>
      <Tarjeta>
        <h2 className="text-xl font-bold uppercase text-glaciar">{p.a_pedido ? 'Precio de referencia' : 'Total'}</h2>
        <dl className="mt-1">
          <Dato etiqueta={p.precio_por === 'persona' ? `Clases (${s.personas.length} × ${precio(p.precio)})` : `Clase (precio por ${p.precio_por})`}>{precio(c.base)}</Dato>
          {c.alta && <Dato etiqueta={`Temporada alta (+${t.recargo_alta_pct}% sobre clases)`}>{precio(c.recargo)}</Dato>}
          {c.montoExtras > 0 && <Dato etiqueta="Extras (sin recargo)">{precio(c.montoExtras)}</Dato>}
          {s.usarCredito && <Dato etiqueta="Crédito">se descuenta al confirmar</Dato>}
          <div className="flex justify-between pt-2 text-xl font-bold"><span>{p.a_pedido ? 'Desde' : 'Total'}</span><span>{precio(c.total)}</span></div>
        </dl>
        {p.a_pedido
          ? <p className="mt-2 text-pizarra/80">Operaciones cotiza tu solicitud y te avisa el precio final. Recién entonces queda pendiente de pago.</p>
          : <p className="mt-2 text-pizarra/80">Al confirmar, tu lugar queda guardado {t.horas_pago} horas mientras registramos el pago.</p>}
      </Tarjeta>
      {e && (
        <Aviso tipo="alerta" titulo={e.codigo === 'COMPLETO' ? 'El turno se llenó' : 'No se pudo confirmar'}>
          <p>{e.mensaje}</p>
          {['COMPLETO', 'SIN_INSTRUCTOR', 'CERRADO'].includes(e.codigo) && (
            <Boton variante="secundario" className="mt-2" onClick={() => set({ paso: 1, turno: null })}>Elegir otro turno</Boton>
          )}
          {e.codigo === 'NIVELES_MEZCLADOS' || e.codigo.startsWith('EDAD') ? (
            <Boton variante="secundario" className="mt-2" onClick={() => set({ paso: 0 })}>Revisar personas</Boton>
          ) : null}
        </Aviso>
      )}
      <div className="flex justify-between pt-2">
        <Boton variante="secundario" onClick={() => set({ paso: 2 })}><ChevronLeft className="size-5" /> Atrás</Boton>
        <Boton grande cargando={enviando} onClick={confirmar}>
          {!usuario ? 'Ingresar para confirmar' : p.a_pedido ? 'Enviar solicitud' : 'Confirmar reserva'}
        </Boton>
      </div>
    </div>
  )
}

// ---------------- Resultado ----------------
function Resultado({ p, s, division, onDivision, onOtra }) {
  const r = s.resultado
  const datosAviso = {
    codigo: r.codigo, producto: p.nombre, centro: r.centro, fecha: s.fecha,
    hora_inicio: s.turno?.hora_inicio || p.horarios[0], hora_fin: s.turno?.hora_fin || p.horarios[0],
    punto_encuentro: r.punto, personas: s.personas.map((x) => x.nombre).join(', '),
    estado: { solicitud: 'Solicitud enviada', pendiente_pago: 'Pendiente de pago', confirmada: 'Confirmada' }[r.estado] || r.estado,
    total: p.a_pedido ? null : r.total,
  }
  return (
    <Pagina ancho="max-w-2xl">
      <Tarjeta className="text-center">
        <p className="text-pizarra/70">Código de reserva</p>
        <p className="titulo text-5xl font-bold text-glaciar">{r.codigo}</p>
        <div className="mt-2"><Estado estado={r.estado} grande /></div>
        {r.repetida && <p className="mt-2 text-sm text-pizarra/70">Esta reserva ya estaba creada: no se duplicó.</p>}
        <p className="mt-3 text-lg">{p.nombre} · {r.centro} · {fechaLarga(s.fecha)}{s.turno ? `, ${hora(s.turno.hora_inicio)}` : ''}</p>
      </Tarjeta>
      {r.estado === 'pendiente_pago' && (
        <Aviso className="mt-4" titulo={`Total a pagar: ${precio(r.total)}`}>
          <p>Tu lugar queda guardado hasta el <strong>{momento(r.vence_en)}</strong>. Paga por transferencia o en nuestra base de Lo Barnechea indicando el código <strong>{r.codigo}</strong>. Cuando operaciones registra el pago, la reserva pasa a confirmada.</p>
          {r.credito_aplicado > 0 && <p className="mt-1">Se descontaron {precio(r.credito_aplicado)} de tu crédito.</p>}
        </Aviso>
      )}
      {r.estado === 'confirmada' && <Aviso tipo="ok" className="mt-4" titulo="Reserva confirmada">Se pagó con tu crédito ({precio(r.credito_aplicado)}). ¡Nos vemos en la nieve!</Aviso>}
      {r.estado === 'solicitud' && <Aviso className="mt-4" titulo="Solicitud enviada">Operaciones la cotiza y verás el precio en Mi cuenta. Recién entonces queda pendiente de pago.</Aviso>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {!p.a_pedido && (
          <Boton variante="secundario" onClick={() => descargarIcs({
            titulo: `CDSKI · ${p.nombre}`, fecha: s.fecha, inicio: s.turno.hora_inicio, fin: s.turno.hora_fin,
            lugar: `${r.centro} · ${r.punto}`, descripcion: textoReserva(datosAviso), uid: r.codigo,
          })}><CalendarPlus className="size-5" /> Agregar al calendario (.ics)</Boton>
        )}
        <a href={linkWhatsapp(textoReserva(datosAviso))} target="_blank" rel="noreferrer"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-glaciar bg-white px-4 font-semibold text-glaciar hover:bg-hielo">
          <Share2 className="size-5" /> Compartir por WhatsApp
        </a>
      </div>
      {division?.length > 0 && (
        <Aviso tipo="alerta" className="mt-4" titulo="Falta la segunda reserva">
          <p>Quedaron {division.length} {division.length === 1 ? 'persona' : 'personas'} de nivel {nivel(division[0].nivel)} para reservar aparte.</p>
          <Boton className="mt-2" onClick={onDivision}>Reservar ahora a {division.map((x) => x.nombre).join(', ')}</Boton>
        </Aviso>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to={`/mi-cuenta/reservas/${r.reserva_id}`} className="inline-flex min-h-11 items-center rounded-xl bg-glaciar px-4 font-semibold text-white">Ver mi reserva</Link>
        <Boton variante="texto" onClick={onOtra}>Hacer otra reserva</Boton>
      </div>
    </Pagina>
  )
}
