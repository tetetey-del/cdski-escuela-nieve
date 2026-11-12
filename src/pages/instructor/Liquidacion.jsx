import { useState } from 'react'
import { Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, fecha, fechaCorta } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Estado, Tarjeta, Titulo, Vacio, Aviso } from '../../components/ui'

export const CONCEPTO = {
  clase: 'Clase', adicional_ninos: 'Adicional chicos', adicional_ingles: 'Adicional inglés', minimo_clima: 'Mínimo por clima',
  anticipo: 'Anticipo', orden: 'Servicio', cargo_cancelacion: 'Cancelación con cargo', ajuste: 'Ajuste',
}

// Lista de renglones: cada importe con su origen, para que la liquidación se explique sola
export function Renglones({ renglones }) {
  if (!renglones.length) return <Vacio>Sin renglones en esta quincena.</Vacio>
  const total = renglones.reduce((a, r) => a + r.importe, 0)
  return (
    <div>
      <ul className="divide-y divide-glaciar/10">
        {renglones.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-semibold">{CONCEPTO[r.concepto]} <span className="font-normal text-pizarra/60">· {fechaCorta(r.fecha)}</span></p>
              <p className="text-sm text-pizarra/80">{r.descripcion}</p>
            </div>
            <span className={`shrink-0 font-bold ${r.importe < 0 ? 'text-[#b34a0f]' : ''}`}>{precio(r.importe)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between border-t-2 border-glaciar pt-2 text-2xl font-bold"><span className="titulo uppercase">Total</span><span>{precio(total)}</span></div>
    </div>
  )
}

export default function LiquidacionInstructor() {
  const { hoy } = useSesion()
  const quincenas = useDatos(() => q(supabase.from('quincenas').select('*').order('inicio')))
  const [sel, setSel] = useState(null)
  const actual = sel ?? quincenas.datos?.find((x) => x.inicio <= hoy && x.fin >= hoy)?.id ?? quincenas.datos?.[0]?.id
  const renglones = useDatos(async () => (actual ? q(supabase.from('renglones_liquidacion').select('*').eq('quincena_id', actual).order('fecha').order('id')) : []), [actual])
  const qn = quincenas.datos?.find((x) => x.id === actual)

  return (
    <Pagina ancho="max-w-2xl">
      <Titulo>Mi liquidación</Titulo>
      {quincenas.cargando && <Cargando />}
      <ErrorAccion error={quincenas.error || renglones.error} onActualizar={() => { quincenas.recargar(); renglones.recargar() }} />
      {quincenas.datos && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {quincenas.datos.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-left ${x.id === actual ? 'bg-glaciar text-white' : 'bg-white ring-1 ring-glaciar/15'}`}>
              <span className="block font-semibold">{fechaCorta(x.inicio)}–{fechaCorta(x.fin)}</span>
              <span className="text-sm opacity-80">{{ borrador: 'Borrador', aprobada: 'Aprobada', pagada: 'Pagada' }[x.estado]}</span>
            </button>
          ))}
        </div>
      )}
      {qn && (
        <Tarjeta className="mt-3">
          {qn.estado === 'pagada' && <Aviso className="mb-2"><Lock className="inline size-4" /> Pagada: no se modifica. Si aparece una corrección, entra como ajuste en la quincena abierta.</Aviso>}
          {qn.estado === 'borrador' && <p className="mb-2 text-sm text-pizarra/70">Borrador: administración la recalcula hasta aprobarla. Solo incluye clases ya dictadas.</p>}
          {renglones.cargando ? <Cargando /> : <Renglones renglones={renglones.datos || []} />}
        </Tarjeta>
      )}
    </Pagina>
  )
}
