import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { SesionProvider, useSesion, INICIO_POR_ROL } from './lib/sesion'
import { configurado } from './lib/supabase'
import Layout, { Pagina } from './components/Layout'
import { Aviso, Cargando } from './components/ui'

// Público y cliente
import Inicio from './pages/publico/Inicio'
const Producto = lazy(() => import('./pages/publico/Producto'))
const Asistente = lazy(() => import('./pages/publico/Asistente'))
const Ingreso = lazy(() => import('./pages/publico/Ingreso'))
const MiCuenta = lazy(() => import('./pages/cliente/MiCuenta'))
const DetalleReserva = lazy(() => import('./pages/cliente/DetalleReserva'))
// Instructor
const Agenda = lazy(() => import('./pages/instructor/Agenda'))
const Clase = lazy(() => import('./pages/instructor/Clase'))
const LiquidacionInstructor = lazy(() => import('./pages/instructor/Liquidacion'))
// Proveedor
const Ordenes = lazy(() => import('./pages/proveedor/Ordenes'))
// Operaciones
const Tablero = lazy(() => import('./pages/operaciones/Tablero'))
const Asignacion = lazy(() => import('./pages/operaciones/Asignacion'))
const Solicitudes = lazy(() => import('./pages/operaciones/Solicitudes'))
const Clima = lazy(() => import('./pages/operaciones/Clima'))
const Reservas = lazy(() => import('./pages/operaciones/Reservas'))
// Administración
const Liquidaciones = lazy(() => import('./pages/admin/Liquidaciones'))
const Informes = lazy(() => import('./pages/admin/Informes'))
const Configuracion = lazy(() => import('./pages/admin/Configuracion'))

// Solo deja pasar a los roles indicados. La seguridad real está en la base (RLS):
// esto evita mostrar pantallas que no corresponden.
function Requiere({ roles, children }) {
  const { usuario, rol, cargando } = useSesion()
  const loc = useLocation()
  if (cargando || (usuario && !rol)) return <Cargando />
  if (!usuario) return <Navigate to={`/ingresar?volver=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (!roles.includes(rol)) return <Navigate to={INICIO_POR_ROL[rol] || '/'} replace />
  return children
}

const STAFF = ['operaciones', 'administracion']

export default function App() {
  if (!configurado) {
    return (
      <Pagina ancho="max-w-xl">
        <Aviso tipo="alerta" titulo="Falta configurar Supabase">
          Crea el archivo <code>.env.local</code> a partir de <code>.env.example</code> con la URL y la clave publicable de tu proyecto. Los pasos están en el README.
        </Aviso>
      </Pagina>
    )
  }
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Inicio />} />
            <Route path="productos/:codigo" element={<Producto />} />
            <Route path="reservar/:codigo" element={<Asistente />} />
            <Route path="ingresar" element={<Ingreso />} />

            <Route path="mi-cuenta" element={<Requiere roles={['cliente']}><MiCuenta /></Requiere>} />
            <Route path="mi-cuenta/reservas/:id" element={<Requiere roles={['cliente']}><DetalleReserva /></Requiere>} />

            <Route path="instructor" element={<Requiere roles={['instructor']}><Agenda /></Requiere>} />
            <Route path="instructor/clases/:id" element={<Requiere roles={['instructor']}><Clase /></Requiere>} />
            <Route path="instructor/liquidacion" element={<Requiere roles={['instructor']}><LiquidacionInstructor /></Requiere>} />

            <Route path="proveedor" element={<Requiere roles={['proveedor']}><Ordenes /></Requiere>} />

            <Route path="operaciones" element={<Requiere roles={STAFF}><Tablero /></Requiere>} />
            <Route path="operaciones/asignacion" element={<Requiere roles={STAFF}><Asignacion /></Requiere>} />
            <Route path="operaciones/reservas" element={<Requiere roles={STAFF}><Reservas /></Requiere>} />
            <Route path="operaciones/solicitudes" element={<Requiere roles={STAFF}><Solicitudes /></Requiere>} />
            <Route path="operaciones/clima" element={<Requiere roles={STAFF}><Clima /></Requiere>} />

            <Route path="admin/liquidaciones" element={<Requiere roles={['administracion']}><Liquidaciones /></Requiere>} />
            <Route path="admin/informes" element={<Requiere roles={STAFF}><Informes /></Requiere>} />
            <Route path="admin/configuracion" element={<Requiere roles={['administracion']}><Configuracion /></Requiere>} />

            <Route path="*" element={<Pagina><Aviso titulo="Página no encontrada">Vuelve al inicio desde el logo.</Aviso></Pagina>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  )
}
