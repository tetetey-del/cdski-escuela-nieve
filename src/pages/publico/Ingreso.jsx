import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSesion, INICIO_POR_ROL } from '../../lib/sesion'
import { Pagina } from '../../components/Layout'
import { Boton, Campo, entrada, ErrorAccion, Tarjeta, Aviso } from '../../components/ui'

const CUENTAS = [
  ['Cliente', 'cliente@cdski.test'], ['Operaciones', 'operaciones@cdski.test'], ['Administración', 'admin@cdski.test'],
  ['Instructor', 'instructor@cdski.test'], ['Proveedor', 'proveedor@cdski.test'],
]

export default function Ingreso() {
  const [modo, setModo] = useState('ingresar')
  const [f, setF] = useState({ email: '', password: '', nombre: '', telefono: '' })
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const { rol } = useSesion()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const volver = params.get('volver')

  useEffect(() => {
    if (rol) nav(volver && (rol === 'cliente' || !volver.startsWith('/reservar')) ? volver : INICIO_POR_ROL[rol], { replace: true })
  }, [rol, volver, nav])

  const enviar = async (e) => {
    e.preventDefault()
    setError(null); setEnviando(true)
    try {
      if (modo === 'ingresar') {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
        if (error) throw error
      } else {
        if (f.nombre.trim().length < 3) throw new Error('NOMBRE: Escribe tu nombre y apellido')
        // El rol no se elige: la base asigna "cliente" a toda cuenta nueva.
        const { data, error } = await supabase.auth.signUp({
          email: f.email.trim(), password: f.password,
          options: { data: { nombre: f.nombre.trim(), telefono: f.telefono.trim() } },
        })
        if (error) throw error
        if (!data.session) throw new Error('CONFIRMACION: La cuenta se creó pero el proyecto pide confirmar el correo. Desactiva "Confirm email" en Supabase (ver README).')
      }
    } catch (err) { setError(err) } finally { setEnviando(false) }
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <Pagina ancho="max-w-md">
      <h1 className="text-4xl font-bold uppercase text-glaciar">{modo === 'ingresar' ? 'Ingresar' : 'Crear cuenta'}</h1>
      {volver?.startsWith('/reservar') && <Aviso className="mt-3">Ingresa o crea tu cuenta para confirmar la reserva. Tus datos quedan guardados.</Aviso>}
      <Tarjeta className="mt-4">
        <div className="mb-4 grid grid-cols-2 rounded-xl bg-hielo p-1">
          {[['ingresar', 'Ya tengo cuenta'], ['registro', 'Soy nuevo']].map(([m, t]) => (
            <button key={m} onClick={() => { setModo(m); setError(null) }}
              className={`min-h-11 rounded-lg font-semibold ${modo === m ? 'bg-white text-glaciar shadow' : 'text-glaciar/70'}`}>{t}</button>
          ))}
        </div>
        <form onSubmit={enviar} className="space-y-3">
          {modo === 'registro' && (
            <>
              <Campo etiqueta="Nombre y apellido"><input className={entrada} value={f.nombre} onChange={set('nombre')} autoComplete="name" required /></Campo>
              <Campo etiqueta="Teléfono (opcional)"><input className={entrada} value={f.telefono} onChange={set('telefono')} autoComplete="tel" inputMode="tel" placeholder="+56 9 …" /></Campo>
            </>
          )}
          <Campo etiqueta="Correo"><input className={entrada} type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Campo>
          <Campo etiqueta="Contraseña" ayuda={modo === 'registro' ? 'Mínimo 6 caracteres' : null}>
            <input className={entrada} type="password" value={f.password} onChange={set('password')} autoComplete={modo === 'ingresar' ? 'current-password' : 'new-password'} minLength={6} required />
          </Campo>
          <ErrorAccion error={error} />
          <Boton type="submit" bloque grande cargando={enviando}>{modo === 'ingresar' ? 'Ingresar' : 'Crear cuenta'}</Boton>
        </form>
      </Tarjeta>

      <Tarjeta className="mt-4 bg-hielo">
        <p className="flex items-center gap-2 font-bold text-glaciar"><KeyRound className="size-5" /> Cuentas de prueba</p>
        <p className="text-sm text-pizarra/70">Contraseña de todas: <strong>Nieve2027</strong></p>
        <div className="mt-2 grid gap-2">
          {CUENTAS.map(([r, email]) => (
            <button key={email} onClick={() => { setModo('ingresar'); setF({ ...f, email, password: 'Nieve2027' }) }}
              className="flex min-h-11 items-center justify-between rounded-lg bg-white px-3 text-left ring-1 ring-glaciar/10 hover:ring-cielo">
              <span className="font-semibold">{r}</span><span className="text-sm text-pizarra/70">{email}</span>
            </button>
          ))}
        </div>
      </Tarjeta>
    </Pagina>
  )
}
