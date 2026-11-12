// Avisos sin servicios externos: archivo .ics para el calendario y texto
// listo para compartir por WhatsApp. No se envían correos ni SMS.
import { fechaLarga, hora, precio } from './formato'

const pad = (n) => String(n).padStart(2, '0')
const icsFecha = (f, h) => `${String(f).replaceAll('-', '')}T${String(h).slice(0, 5).replace(':', '')}00`

export function descargarIcs({ titulo, fecha, inicio, fin, lugar, descripcion, uid }) {
  const ahora = new Date()
  const stamp = `${ahora.getUTCFullYear()}${pad(ahora.getUTCMonth() + 1)}${pad(ahora.getUTCDate())}T${pad(ahora.getUTCHours())}${pad(ahora.getUTCMinutes())}00Z`
  const limpiar = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CDSKI//Escuela de nieve//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid || crypto.randomUUID()}@cdski`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/Santiago:${icsFecha(fecha, inicio)}`,
    `DTEND;TZID=America/Santiago:${icsFecha(fecha, fin)}`,
    `SUMMARY:${limpiar(titulo)}`,
    `LOCATION:${limpiar(lugar)}`,
    `DESCRIPTION:${limpiar(descripcion)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', `DESCRIPTION:${limpiar(titulo)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `cdski-${fecha}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Abre WhatsApp con el texto armado; la persona elige a quién mandarlo.
export const linkWhatsapp = (texto) => `https://wa.me/?text=${encodeURIComponent(texto)}`

export function textoReserva(r) {
  const lineas = [
    `🏔️ CDSKI · Reserva ${r.codigo}`,
    `${r.producto} · ${r.centro}`,
    `${fechaLarga(r.fecha)}, ${hora(r.hora_inicio)} a ${hora(r.hora_fin)}`,
    `Punto de encuentro: ${r.punto_encuentro}`,
    `Personas: ${r.personas}`,
    `Estado: ${r.estado}`,
  ]
  if (r.total != null) lineas.push(`Total: ${precio(r.total)}`)
  if (r.extra) lineas.push(r.extra)
  return lineas.join('\n')
}
