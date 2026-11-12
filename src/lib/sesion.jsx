import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, rpc, configurado } from './supabase'

const Ctx = createContext(null)

export const INICIO_POR_ROL = {
  cliente: '/mi-cuenta',
  instructor: '/instructor',
  proveedor: '/proveedor',
  operaciones: '/operaciones',
  administracion: '/operaciones',
}

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [reloj, setReloj] = useState(null)

  const cargarPerfil = useCallback(async (u) => {
    if (!u) { setPerfil(null); return }
    const { data } = await supabase.from('perfiles').select('id, rol, nombre, telefono').eq('id', u.id).single()
    setPerfil(data)
  }, [])

  const actualizarReloj = useCallback(async () => {
    try { setReloj(await rpc('estado_reloj')) } catch { setReloj(null) }
  }, [])

  useEffect(() => {
    if (!configurado) { setCargando(false); return }
    supabase.auth.getSession().then(async ({ data }) => {
      setUsuario(data.session?.user ?? null)
      await cargarPerfil(data.session?.user)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUsuario(s?.user ?? null)
      cargarPerfil(s?.user)
    })
    actualizarReloj()
    return () => sub.subscription.unsubscribe()
  }, [cargarPerfil, actualizarReloj])

  const salir = async () => { await supabase.auth.signOut(); setPerfil(null) }

  // "Hoy" según el reloj de la escuela (puede ser el reloj de demostración)
  const hoy = reloj?.ahora_chile ? String(reloj.ahora_chile).slice(0, 10) : new Date().toISOString().slice(0, 10)

  return (
    <Ctx.Provider value={{ usuario, perfil, rol: perfil?.rol, cargando, salir, reloj, hoy, actualizarReloj, recargarPerfil: () => cargarPerfil(usuario) }}>
      {children}
    </Ctx.Provider>
  )
}

export const useSesion = () => useContext(Ctx)
