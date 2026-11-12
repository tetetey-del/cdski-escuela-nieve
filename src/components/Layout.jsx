import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X, LogOut, Clock } from 'lucide-react'
import { useSesion, INICIO_POR_ROL } from '../lib/sesion'
import { Logo } from './Cumbres'
import { momento } from '../lib/formato'

const MENUS = {
  cliente: [['/', 'Clases'], ['/mi-cuenta', 'Mi cuenta']],
  instructor: [['/instructor', 'Agenda'], ['/instructor/liquidacion', 'Mi liquidación']],
  proveedor: [['/proveedor', 'Mis órdenes']],
  operaciones: [
    ['/operaciones', 'Tablero'], ['/operaciones/asignacion', 'Asignación'], ['/operaciones/reservas', 'Reservas'],
    ['/operaciones/solicitudes', 'Solicitudes'], ['/operaciones/clima', 'Clima'], ['/admin/informes', 'Informes'],
  ],
  administracion: [
    ['/operaciones', 'Tablero'], ['/operaciones/asignacion', 'Asignación'], ['/operaciones/reservas', 'Reservas'],
    ['/operaciones/solicitudes', 'Solicitudes'], ['/operaciones/clima', 'Clima'], ['/admin/liquidaciones', 'Liquidaciones'],
    ['/admin/informes', 'Informes'], ['/admin/configuracion', 'Configuración'],
  ],
}
const NOMBRE_ROL = { cliente: 'Cliente', instructor: 'Instructor', proveedor: 'Proveedor', operaciones: 'Operaciones', administracion: 'Administración' }

export default function Layout() {
  const { perfil, rol, salir, reloj } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const { pathname } = useLocation()
  const publico = !rol || rol === 'cliente'
  const menu = MENUS[rol] || [['/', 'Clases']]

  return (
    <div className="flex min-h-dvh flex-col">
      {reloj?.simulado && (
        <div className="bg-alerta px-3 py-1.5 text-center text-sm font-semibold text-white">
          <Clock className="mr-1 inline size-4 align-[-3px]" aria-hidden />
          Modo demostración · el sistema funciona como si fuera el {momento(reloj.ahora)}
        </div>
      )}
      <header className={publico && pathname === '/' ? 'cielo-alto' : 'bg-glaciar'}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to={rol ? INICIO_POR_ROL[rol] : '/'} aria-label="CDSKI, inicio"><Logo claro /></Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {menu.map(([to, t]) => (
              <NavLink key={to} to={to} end
                className={({ isActive }) => `rounded-lg px-3 py-2 font-semibold ${isActive ? 'bg-white text-glaciar' : 'text-white hover:bg-white/10'}`}>
                {t}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {perfil ? (
              <div className="hidden text-right text-sm leading-tight text-white sm:block">
                <p className="font-semibold">{perfil.nombre}</p>
                <p className="text-white/70">{NOMBRE_ROL[rol]}</p>
              </div>
            ) : (
              <Link to="/ingresar" className="rounded-xl bg-white px-4 py-2 font-semibold text-glaciar">Ingresar</Link>
            )}
            {perfil && (
              <button onClick={salir} className="hidden rounded-lg p-2 text-white hover:bg-white/10 lg:block" aria-label="Salir" title="Salir">
                <LogOut className="size-5" />
              </button>
            )}
            {(perfil || menu.length > 1) && (
              <button onClick={() => setAbierto(!abierto)} className="rounded-lg p-2 text-white hover:bg-white/10 lg:hidden" aria-label="Menú" aria-expanded={abierto}>
                {abierto ? <X className="size-7" /> : <Menu className="size-7" />}
              </button>
            )}
          </div>
        </div>
        {abierto && (
          <nav className="border-t border-white/15 px-4 pb-3 lg:hidden" onClick={() => setAbierto(false)}>
            {perfil && <p className="py-2 text-sm text-white/80">{perfil.nombre} · {NOMBRE_ROL[rol]}</p>}
            {menu.map(([to, t]) => (
              <NavLink key={to} to={to} end
                className={({ isActive }) => `block rounded-lg px-3 py-3 text-lg font-semibold ${isActive ? 'bg-white text-glaciar' : 'text-white'}`}>
                {t}
              </NavLink>
            ))}
            {perfil && (
              <button onClick={salir} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-3 text-lg font-semibold text-white">
                <LogOut className="size-5" /> Salir
              </button>
            )}
          </nav>
        )}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-glaciar px-4 py-6 text-center text-sm text-white/80">
        <p className="titulo text-lg font-semibold text-white">CDSKI · Escuela de esquí y snowboard</p>
        <p>Base en Lo Barnechea · Clases en Centro Portezuelo, Centro Quebrada Alta y Centro Los Nevados</p>
      </footer>
    </div>
  )
}

export const Pagina = ({ children, ancho = 'max-w-6xl' }) => (
  <div className={`mx-auto w-full ${ancho} px-4 py-6`}>{children}</div>
)
