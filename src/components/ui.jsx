import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CircleCheck, CircleX, Clock, Play, Flag, TimerOff, CloudSnow, FileQuestion, Send, ThumbsUp, CheckCheck,
  Ban, TriangleAlert, PenLine, BadgeCheck, Lock, RefreshCw, X, Info, Hourglass,
} from 'lucide-react'
import { leerError, esConflicto } from '../lib/errores'

const cx = (...c) => c.filter(Boolean).join(' ')

// ---------- Botones ----------
const VARIANTES = {
  primario: 'bg-glaciar text-white hover:bg-[#0d4a73] active:bg-[#082c45]',
  secundario: 'bg-white text-glaciar border-2 border-glaciar hover:bg-hielo',
  suave: 'bg-hielo text-glaciar hover:bg-[#d8eaf6]',
  alerta: 'bg-alerta text-white hover:bg-[#d95a14]',
  ok: 'bg-ok text-white hover:bg-[#268a5c]',
  texto: 'text-cielo underline-offset-4 hover:underline px-1',
}
export function Boton({ variante = 'primario', grande, bloque, className, cargando, children, ...p }) {
  return (
    <button
      {...p}
      disabled={p.disabled || cargando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed',
        variante !== 'texto' && (grande ? 'min-h-14 px-5 text-lg' : 'min-h-11 px-4'),
        bloque && 'w-full',
        VARIANTES[variante], className,
      )}
    >
      {cargando && <RefreshCw className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
export const BotonLink = ({ to, variante = 'primario', grande, bloque, className, children }) => (
  <Link
    to={to}
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition',
      grande ? 'min-h-14 px-5 text-lg' : 'min-h-11 px-4', bloque && 'w-full', VARIANTES[variante], className,
    )}
  >
    {children}
  </Link>
)

// ---------- Contenedores ----------
export const Tarjeta = ({ className, children, ...p }) => (
  <div {...p} className={cx('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-glaciar/10', className)}>{children}</div>
)
export const Titulo = ({ children, sub, accion }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-3xl font-bold uppercase leading-none text-glaciar sm:text-4xl">{children}</h1>
      {sub && <p className="mt-1 text-pizarra/70">{sub}</p>}
    </div>
    {accion}
  </div>
)
export const Seccion = ({ titulo, children, accion }) => (
  <section className="mt-6">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-xl font-bold uppercase text-glaciar">{titulo}</h2>
      {accion}
    </div>
    {children}
  </section>
)

// ---------- Estados: ícono + texto + color (nunca solo color) ----------
const ESTADOS = {
  // reservas
  solicitud: ['Solicitud', FileQuestion, 'bg-white text-cielo ring-cielo'],
  pendiente_pago: ['Pendiente de pago', Clock, 'bg-hielo text-glaciar ring-glaciar/40'],
  confirmada: ['Confirmada', CircleCheck, 'bg-ok/10 text-ok ring-ok'],
  en_curso: ['En curso', Play, 'bg-cielo/10 text-cielo ring-cielo'],
  finalizada: ['Finalizada', Flag, 'bg-pizarra/5 text-pizarra ring-pizarra/30'],
  cancelada: ['Cancelada', CircleX, 'bg-pizarra/5 text-pizarra/70 ring-pizarra/20'],
  vencida: ['Vencida', TimerOff, 'bg-pizarra/5 text-pizarra/70 ring-pizarra/20'],
  afectada_clima: ['Afectada por clima', CloudSnow, 'bg-alerta/10 text-[#b34a0f] ring-alerta'],
  // órdenes
  pedida: ['Pedida', Send, 'bg-hielo text-glaciar ring-glaciar/40'],
  aceptada: ['Aceptada', ThumbsUp, 'bg-cielo/10 text-cielo ring-cielo'],
  cumplida: ['Cumplida', CheckCheck, 'bg-ok/10 text-ok ring-ok'],
  cancelada_orden: ['Cancelada', Ban, 'bg-pizarra/5 text-pizarra/70 ring-pizarra/20'],
  cancelada_con_cargo: ['Cancelada con cargo', TriangleAlert, 'bg-alerta/10 text-[#b34a0f] ring-alerta'],
  // quincenas
  borrador: ['Borrador', PenLine, 'bg-hielo text-glaciar ring-glaciar/40'],
  aprobada: ['Aprobada', BadgeCheck, 'bg-cielo/10 text-cielo ring-cielo'],
  pagada: ['Pagada', Lock, 'bg-ok/10 text-ok ring-ok'],
  // lista de espera
  esperando: ['En espera', Hourglass, 'bg-hielo text-glaciar ring-glaciar/40'],
  ofrecida: ['Lugar ofrecido', TriangleAlert, 'bg-alerta/10 text-[#b34a0f] ring-alerta'],
  convertida: ['Confirmada', CircleCheck, 'bg-ok/10 text-ok ring-ok'],
  expirada: ['Expirada', TimerOff, 'bg-pizarra/5 text-pizarra/70 ring-pizarra/20'],
}
export function Estado({ estado, tipo, grande }) {
  const clave = tipo === 'orden' && estado === 'cancelada' ? 'cancelada_orden' : estado
  const [texto, Icono, color] = ESTADOS[clave] || [estado, Info, 'bg-white ring-pizarra/20']
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 whitespace-nowrap', grande ? 'px-3 py-1.5 text-base' : 'px-2.5 py-0.5 text-sm', color)}>
      <Icono className={grande ? 'size-5' : 'size-4'} aria-hidden /> {texto}
    </span>
  )
}

// Etiqueta de cupo de un turno
export function Cupo({ etiqueta, libres }) {
  const m = {
    Disponible: [CircleCheck, 'bg-ok text-white'],
    'Últimos lugares': [TriangleAlert, 'bg-cielo text-white'],
    Completo: [CircleX, 'bg-alerta text-white'],
    'Cerrado por clima': [CloudSnow, 'bg-alerta text-white'],
  }
  const [Icono, color] = m[etiqueta] || [Info, 'bg-pizarra text-white']
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold uppercase tracking-wide titulo', color)}>
      <Icono className="size-4" aria-hidden /> {etiqueta}
      {libres != null && etiqueta !== 'Completo' && etiqueta !== 'Cerrado por clima' && <span className="font-normal normal-case">· {libres}</span>}
    </span>
  )
}

// ---------- Mensajes ----------
export function Aviso({ tipo = 'info', titulo, children, className }) {
  const estilos = {
    info: ['bg-hielo ring-cielo/40 text-glaciar', Info],
    ok: ['bg-ok/10 ring-ok text-[#1f6e4a]', CircleCheck],
    alerta: ['bg-alerta/10 ring-alerta text-[#9a3f0c]', TriangleAlert],
  }[tipo]
  const Icono = estilos[1]
  return (
    <div role={tipo === 'alerta' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl p-3 ring-1', estilos[0], className)}>
      <Icono className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>{titulo && <p className="font-bold">{titulo}</p>}<div>{children}</div></div>
    </div>
  )
}

// Error de una acción, con botón para actualizar si los datos cambiaron
export function ErrorAccion({ error, onActualizar, className }) {
  if (!error) return null
  const e = leerError(error)
  return (
    <Aviso tipo="alerta" titulo={esConflicto(e.codigo) ? 'Los datos cambiaron' : 'No se pudo completar'} className={className}>
      <p>{e.mensaje}</p>
      {onActualizar && (
        <button onClick={onActualizar} className="mt-2 inline-flex items-center gap-1 font-semibold underline">
          <RefreshCw className="size-4" /> Actualizar datos
        </button>
      )}
    </Aviso>
  )
}

export const Cargando = ({ texto = 'Cargando…' }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-glaciar/70" role="status">
    <RefreshCw className="size-5 animate-spin" aria-hidden /> {texto}
  </div>
)
export const Vacio = ({ children }) => (
  <div className="rounded-2xl border-2 border-dashed border-glaciar/20 p-6 text-center text-pizarra/70">{children}</div>
)

// ---------- Formularios ----------
export function Campo({ etiqueta, ayuda, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block font-semibold text-glaciar">{etiqueta}</span>
      {children}
      {ayuda && !error && <span className="mt-1 block text-sm text-pizarra/60">{ayuda}</span>}
      {error && <span className="mt-1 block text-sm font-semibold text-[#b34a0f]">{error}</span>}
    </label>
  )
}
export const entrada = 'w-full min-h-11 rounded-xl border-2 border-glaciar/20 bg-white px-3 py-2 focus:border-cielo focus:outline-none'

// ---------- Ventana modal ----------
export function Modal({ abierto, onCerrar, titulo, children, ancho = 'max-w-lg' }) {
  useEffect(() => {
    if (!abierto) return
    const f = (e) => e.key === 'Escape' && onCerrar?.()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [abierto, onCerrar])
  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-pizarra/60 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        role="dialog" aria-modal="true" aria-label={titulo}
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl', ancho)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold uppercase text-glaciar">{titulo}</h2>
          <button onClick={onCerrar} className="rounded-lg p-2 hover:bg-hielo" aria-label="Cerrar"><X className="size-6" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------- Datos ----------
// Hook simple para cargar datos con reintento
export function useDatos(cargar, deps = []) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null })
  const [n, setN] = useState(0)
  useEffect(() => {
    let vivo = true
    setEstado((e) => ({ ...e, cargando: true, error: null }))
    cargar()
      .then((datos) => vivo && setEstado({ datos, cargando: false, error: null }))
      .catch((error) => vivo && setEstado({ datos: null, cargando: false, error }))
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return { ...estado, recargar: () => setN((x) => x + 1) }
}

// Lanza el error de una consulta de Supabase o devuelve los datos
export const q = async (consulta) => {
  const { data, error } = await consulta
  if (error) throw error
  return data
}

// Lista de pares etiqueta/valor
export const Dato = ({ etiqueta, children }) => (
  <div className="flex justify-between gap-3 border-b border-glaciar/10 py-1.5 last:border-0">
    <dt className="text-pizarra/70">{etiqueta}</dt>
    <dd className="text-right font-semibold">{children}</dd>
  </div>
)
