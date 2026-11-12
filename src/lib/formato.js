// Formatos para Chile: precios $64.000, fechas dd/mm/aaaa, hora 24 h.

const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
export const precio = (n) => {
  const v = Math.round(Number(n || 0))
  return (v < 0 ? '−' : '') + pesos.format(Math.abs(v)).replace(/\s/g, '')
}

export const hora = (t) => (t ? String(t).slice(0, 5) : '')

// Fechas "YYYY-MM-DD" se tratan como fecha local (sin corrimiento de zona)
export const aFecha = (s) => {
  if (!s) return null
  if (s instanceof Date) return s
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const fechaCorta = (s) => aFecha(s)?.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) ?? ''
export const fecha = (s) => aFecha(s)?.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) ?? ''
export const fechaLarga = (s) => {
  const t = aFecha(s)?.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }) ?? ''
  return t.charAt(0).toUpperCase() + t.slice(1)
}
export const diaSemana = (s) => aFecha(s)?.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '') ?? ''

// Momentos (timestamptz) mostrados en hora de Chile
export const momento = (ts) =>
  ts ? new Date(ts).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : ''

export const isoDia = (d) => {
  const x = aFecha(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const sumarDias = (s, n) => {
  const d = aFecha(s)
  d.setDate(d.getDate() + n)
  return isoDia(d)
}

export const NIVELES = ['principiante', 'intermedio', 'avanzado', 'experto']
export const nivel = (n) => ({ principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado', experto: 'Experto' }[n] || n || '')
export const disciplina = (d) => ({ esqui: 'Esquí', snowboard: 'Snowboard', ambas: 'Esquí y snowboard' }[d] || d || '')
export const idioma = (i) => (i === 'en' ? 'Inglés' : 'Español')
export const tipoOrden = (t) => ({ traslado: 'Traslado', equipo: 'Equipo completo', ropa: 'Ropa de nieve', heliesqui: 'Heliesquí' }[t] || t)
export const medioPago = (m) => ({ transferencia: 'Transferencia', efectivo: 'Efectivo', tarjeta: 'Tarjeta', credito: 'Crédito' }[m] || m)

export const decimal = (n) => String(n ?? '').replace('.', ',')

export const personas = (n) => `${n} ${Number(n) === 1 ? 'persona' : 'personas'}`
