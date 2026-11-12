import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { rpc } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, fecha as fFecha } from '../../lib/formato'
import { descargarCsv } from '../../lib/csv'
import { Pagina } from '../../components/Layout'
import { useDatos, Cargando, ErrorAccion, Tarjeta, Titulo, Boton, Campo, entrada, Vacio } from '../../components/ui'

const $ = (campo, titulo) => ({ campo, titulo, ver: (f) => precio(f[campo]), csv: (f) => f[campo], num: true })
const n = (campo, titulo) => ({ campo, titulo, num: true })
const pct = (campo, titulo) => ({ campo, titulo, ver: (f) => (f[campo] == null ? '—' : `${String(f[campo]).replace('.', ',')}%`), csv: (f) => f[campo], num: true })
const t = (campo, titulo) => ({ campo, titulo })

export const INFORMES = {
  ocupacion: { titulo: 'Ocupación', fn: 'informe_ocupacion', nota: 'Lugares vendidos (reservas confirmadas, en curso o finalizadas) sobre lugares ofrecidos. No cuenta turnos cerrados por clima.',
    cols: [t('producto', 'Producto'), t('centro', 'Centro'), n('turnos', 'Turnos'), n('ofrecidos', 'Ofrecidos'), n('vendidos', 'Vendidos'), pct('ocupacion_pct', 'Ocupación')] },
  ingresos: { titulo: 'Ingresos', fn: 'informe_ingresos', nota: 'Pagos registrados menos reintegros, según la fecha de la clase.',
    cols: [t('producto', 'Producto'), t('centro', 'Centro'), n('reservas', 'Reservas'), $('cobrado', 'Cobrado'), $('reintegrado', 'Reintegrado'), $('neto', 'Neto')] },
  margen: { titulo: 'Margen', fn: 'informe_margen', nota: 'Ingreso neto − horas de instructor (con adicionales y mínimos) − costos de proveedores (repartidos según quién usó cada servicio).',
    cols: [t('producto', 'Producto'), $('ingreso', 'Ingreso'), $('costo_instructores', 'Instructores'), $('costo_proveedores', 'Proveedores'), $('margen', 'Margen'), pct('margen_pct', 'Margen %')] },
  cancelaciones: { titulo: 'Cancelaciones y ausentes', fn: 'informe_cancelaciones', nota: 'Tasa de cancelación sobre reservas; tasa de ausentes sobre participantes de clases finalizadas.',
    cols: [t('producto', 'Producto'), n('reservas', 'Reservas'), n('canceladas', 'Canceladas'), n('vencidas', 'Vencidas'), pct('tasa_cancelacion_pct', 'Cancelación'), n('participantes', 'Participantes'), n('ausentes', 'Ausentes'), pct('tasa_ausentes_pct', 'Ausentes %')] },
  horas: { titulo: 'Horas por instructor', fn: 'informe_horas_instructor', nota: 'Clases dictadas y mínimos por clima. El importe no descuenta anticipos.',
    cols: [t('instructor', 'Instructor'), n('categoria', 'Nivel'), n('clases', 'Clases'), n('horas', 'Horas'), n('minimos_clima', 'Mínimos clima'), $('importe', 'Importe')] },
  creditos: { titulo: 'Saldos de créditos', fn: 'informe_creditos', nota: 'Créditos por clima según la fecha de la clase que los generó.',
    cols: [t('cliente', 'Cliente'), t('reserva_origen', 'Reserva'), { campo: 'fecha_origen', titulo: 'Fecha', ver: (f) => fFecha(f.fecha_origen) }, t('centro', 'Centro'), n('temporada', 'Temporada'), $('monto', 'Monto'), $('usado', 'Usado'), $('saldo', 'Saldo')] },
  proveedores: { titulo: 'Gasto por proveedor', fn: 'informe_proveedores', nota: 'Órdenes cumplidas más cargos de cancelación con menos de 24 h. Las canceladas a tiempo no suman.',
    cols: [t('proveedor', 'Proveedor'), n('cumplidas', 'Cumplidas'), $('monto_cumplidas', 'Monto cumplidas'), n('canceladas_con_cargo', 'Con cargo'), $('cargos', 'Cargos'), n('canceladas_sin_cargo', 'Sin cargo'), $('gasto_total', 'Gasto total')] },
}

export default function Informes() {
  const { hoy } = useSesion()
  const [tipo, setTipo] = useState('ocupacion')
  const [rango, setRango] = useState({ desde: `${hoy.slice(0, 4)}-06-20`, hasta: `${hoy.slice(0, 4)}-09-27` })
  const inf = INFORMES[tipo]
  const { datos, cargando, error, recargar } = useDatos(() => rpc(inf.fn, { p_desde: rango.desde, p_hasta: rango.hasta }), [tipo, rango.desde, rango.hasta])
  const filas = datos || []

  return (
    <Pagina>
      <Titulo>Informes</Titulo>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Object.entries(INFORMES).map(([k, v]) => (
          <button key={k} onClick={() => setTipo(k)} className={`shrink-0 rounded-xl px-3 py-2 font-semibold ${k === tipo ? 'bg-glaciar text-white' : 'bg-white text-glaciar ring-1 ring-glaciar/15'}`}>{v.titulo}</button>
        ))}
      </div>
      <Tarjeta className="mt-2 flex flex-wrap items-end gap-3">
        <Campo etiqueta="Desde"><input type="date" className={entrada} value={rango.desde} onChange={(e) => e.target.value && setRango({ ...rango, desde: e.target.value })} /></Campo>
        <Campo etiqueta="Hasta"><input type="date" className={entrada} value={rango.hasta} onChange={(e) => e.target.value && setRango({ ...rango, hasta: e.target.value })} /></Campo>
        <Boton variante="ok" disabled={!filas.length} className="ml-auto"
          onClick={() => descargarCsv(`cdski-${tipo}-${rango.desde}-a-${rango.hasta}`, inf.cols, filas)}>
          <FileSpreadsheet className="size-5" /> Descargar CSV · {filas.length} filas
        </Boton>
      </Tarjeta>
      <p className="mt-2 text-sm text-pizarra/70">{inf.nota}</p>
      <ErrorAccion error={error} onActualizar={recargar} className="mt-2" />
      {cargando ? <Cargando /> : filas.length === 0 ? <Vacio>Sin datos en ese rango.</Vacio> : (
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-glaciar/15">
          <table className="w-full min-w-max text-left">
            <thead className="bg-glaciar text-white">
              <tr>{inf.cols.map((c) => <th key={c.campo} className={`titulo px-3 py-2 text-lg font-semibold uppercase ${c.num ? 'text-right' : ''}`}>{c.titulo}</th>)}</tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-glaciar/10 odd:bg-hielo/40">
                  {inf.cols.map((c) => <td key={c.campo} className={`px-3 py-2 ${c.num ? 'text-right tabular-nums' : ''}`}>{c.ver ? c.ver(f) : f[c.campo]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Pagina>
  )
}
