// Descarga exactamente las filas que se ven en pantalla.
// Separador ";" y BOM para que Excel en español lo abra bien.
export function descargarCsv(nombre, columnas, filas) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lineas = [
    columnas.map((c) => esc(c.titulo)).join(';'),
    ...filas.map((f) => columnas.map((c) => esc(c.csv ? c.csv(f) : f[c.campo])).join(';')),
  ]
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${nombre}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
