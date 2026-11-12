// Las funciones de la base devuelven errores como "CODIGO: mensaje|dato".
// Acá se separan para mostrarlos en la pantalla que originó la acción.
export function leerError(err) {
  const texto = err?.message || String(err || 'Ocurrió un error')
  const m = texto.match(/^([A-Z_]+):\s*([\s\S]*)$/)
  if (!m) {
    if (/JWT|session|token/i.test(texto)) return { codigo: 'SESION', mensaje: 'Tu sesión expiró. Vuelve a ingresar.' }
    if (/Failed to fetch|NetworkError/i.test(texto)) return { codigo: 'RED', mensaje: 'No hay conexión. Revisa la señal y prueba de nuevo.' }
    if (/Invalid login credentials/i.test(texto)) return { codigo: 'LOGIN', mensaje: 'El correo o la contraseña no coinciden.' }
    return { codigo: 'ERROR', mensaje: texto }
  }
  const [mensaje, dato] = m[2].split('|')
  return { codigo: m[1], mensaje: mensaje.trim(), dato: dato?.trim() }
}

// Códigos que significan "los datos cambiaron: actualizá"
export const esConflicto = (codigo) =>
  ['YA_CONFIRMADA', 'VENCIDA', 'ESTADO', 'COMPLETO', 'YA_ELEGIDA', 'SIN_INSTRUCTOR', 'CERRADO', 'CERRADA'].includes(codigo)
