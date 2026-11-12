import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const configurado = Boolean(url && key)

// La sesión se guarda en sessionStorage: caduca al cerrar la pestaña.
export const supabase = createClient(url || 'http://localhost', key || 'sin-clave', {
  auth: {
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Llama a una función de la base. Devuelve los datos o lanza un error legible.
export async function rpc(nombre, params = {}) {
  const { data, error } = await supabase.rpc(nombre, params)
  if (error) throw error
  return data
}
