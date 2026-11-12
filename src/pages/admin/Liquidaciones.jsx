import { useState } from 'react'
import { Lock, RefreshCw, BadgeCheck, Undo2, Banknote, ChevronDown, PenLine, Plus } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, fecha, fechaCorta } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Tarjeta, Titulo, Boton, Modal, Campo, entrada, Aviso, Estado, Seccion, Vacio } from '../../components/ui'
import { CONCEPTO } from '../instructor/Liquidacion'

export default function Liquidaciones() {
  const { hoy } = useSesion()
  const quincenas = useDatos(() => q(supabase.from('quincenas').select('*').order('inicio')))
  const [sel, setSel] = useState(null)
  const actual = sel ?? quincenas.datos?.find((x) => x.estado !== 'pagada' && x.inicio <= hoy)?.id ?? quincenas.datos?.[0]?.id
  const qn = quincenas.datos?.find((x) => x.id === actual)
  const detalle = useDatos(async () => {
    if (!actual) return null
    const [resumen, renglones] = await Promise.all([
      rpc('resumen_quincena', { p_quincena: actual }),
      q(supabase.from('renglones_liquidacion').select('*').eq('quincena_id', actual).order('fecha').order('id')),
    ])
    return { resumen, renglones }
  }, [actual])
  const [abierto, setAbierto] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(null)
  const [ajuste, setAjuste] = useState(null)
  const [anticipo, setAnticipo] = useState(false)

  const accion = async (fn, msg) => {
    setOcupado(fn); setError(null); setOk(null)
    try { const r = await rpc(fn, { p_quincena: actual }); setOk(msg(r)); quincenas.recargar(); detalle.recargar() } catch (e) { setError(e) } finally { setOcupado(null) }
  }

  const total = (detalle.datos?.resumen || []).reduce((a, r) => a + r.total, 0)

  return (
    <Pagina>
      <Titulo
        accion={<Boton variante="secundario" onClick={() => setAnticipo(true)}><Plus className="size-4" /> Cargar anticipo</Boton>}>Liquidaciones</Titulo>
      {quincenas.cargando && <Cargando />}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {(quincenas.datos || []).map((x) => (
          <button key={x.id} onClick={() => { setSel(x.id); setOk(null); setError(null) }}
            className={`shrink-0 rounded-xl px-3 py-2 text-left ${x.id === actual ? 'bg-glaciar text-white' : 'bg-white ring-1 ring-glaciar/15'}`}>
            <span className="block font-semibold">{fechaCorta(x.inicio)}–{fechaCorta(x.fin)}</span>
            <span className="text-sm opacity-80">{{ borrador: 'Borrador', aprobada: 'Aprobada', pagada: '🔒 Pagada' }[x.estado]}</span>
          </button>
        ))}
      </div>

      {qn && (
        <Tarjeta className="mt-3">
          <p className="text-lg">Total a pagar: <strong>{precio(total)}</strong></p>
          <div className="mt-3 flex flex-wrap gap-2">
            {qn.estado === 'borrador' && <>
              <Boton variante="secundario" cargando={ocupado === 'generar_liquidacion'} onClick={() => accion('generar_liquidacion', (r) => `Recalculada: ${r.renglones} renglones y ${r.ajustes} ajustes de quincenas pagadas.`)}><RefreshCw className="size-4" /> Recalcular</Boton>
              <Boton cargando={ocupado === 'aprobar_quincena'} onClick={() => accion('aprobar_quincena', () => 'Quincena aprobada.')}><BadgeCheck className="size-4" /> Aprobar</Boton>
            </>}
            {qn.estado === 'aprobada' && <>
              <Boton variante="secundario" cargando={ocupado === 'reabrir_quincena'} onClick={() => accion('reabrir_quincena', () => 'Quincena reabierta como borrador.')}><Undo2 className="size-4" /> Reabrir</Boton>
              <Boton variante="ok" cargando={ocupado === 'pagar_quincena'} onClick={() => accion('pagar_quincena', () => 'Quincena marcada como pagada: desde ahora queda bloqueada.')}><Banknote className="size-4" /> Marcar pagada</Boton>
            </>}
          </div>
          {qn.estado === 'pagada' && <Aviso className="mt-3"><Lock className="inline size-4" /> Pagada el {fecha(String(qn.pagada_en).slice(0, 10))}. Nada de este período se edita: usa “Ajustar” en un renglón y el ajuste entra en la quincena abierta siguiente con referencia al original.</Aviso>}
          {qn.estado === 'borrador' && qn.fin >= hoy && <p className="mt-2 text-sm text-pizarra/70">La quincena todavía no termina: se aprueba cuando termine. Solo incluye clases ya dictadas.</p>}
          <ErrorAccion error={error} className="mt-3" onActualizar={() => { quincenas.recargar(); detalle.recargar() }} />
          {ok && <Aviso tipo="ok" className="mt-3">{ok}</Aviso>}
        </Tarjeta>
      )}

      {detalle.cargando ? <Cargando /> : detalle.datos && (
        <Seccion titulo="Por persona y proveedor">
          {detalle.datos.resumen.length === 0 && <Vacio>Sin renglones. Usa “Recalcular”.</Vacio>}
          <div className="space-y-2">
            {detalle.datos.resumen.map((b) => {
              const clave = `${b.tipo}-${b.beneficiario_id}`
              const filas = detalle.datos.renglones.filter((r) => (b.tipo === 'instructor' ? r.instructor_id : r.proveedor_id) === b.beneficiario_id)
              return (
                <Tarjeta key={clave} className="p-0">
                  <button onClick={() => setAbierto(abierto === clave ? null : clave)} className="flex w-full items-center justify-between gap-3 p-3 text-left">
                    <span><span className="font-bold">{b.nombre}</span> <span className="text-sm text-pizarra/60">· {b.tipo} · {b.renglones} renglones</span>
                      {b.descuentos < 0 && <span className="block text-sm text-pizarra/70">{precio(b.bruto)} − {precio(-b.descuentos)} de anticipos/ajustes</span>}</span>
                    <span className="flex items-center gap-2 text-lg font-bold">{precio(b.total)}<ChevronDown className={`size-5 transition ${abierto === clave ? 'rotate-180' : ''}`} /></span>
                  </button>
                  {abierto === clave && (
                    <ul className="divide-y divide-glaciar/10 border-t border-glaciar/10 px-3">
                      {filas.map((r) => (
                        <li key={r.id} className="flex items-start justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <p className="font-semibold">{CONCEPTO[r.concepto]} <span className="font-normal text-pizarra/60">· {fechaCorta(r.fecha)} · #{r.id}{r.ajusta_renglon_id ? ` (ajusta #${r.ajusta_renglon_id})` : ''}</span></p>
                            <p className="text-sm text-pizarra/80">{r.descripcion}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`font-bold ${r.importe < 0 ? 'text-[#b34a0f]' : ''}`}>{precio(r.importe)}</p>
                            {qn.estado === 'pagada' && <button className="text-sm font-semibold text-cielo" onClick={() => setAjuste(r)}><PenLine className="inline size-3" /> Ajustar</button>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              )
            })}
          </div>
        </Seccion>
      )}
      {ajuste && <ModalAjuste r={ajuste} onCerrar={() => setAjuste(null)} onListo={(msg) => { setAjuste(null); setOk(msg); quincenas.recargar() }} />}
      {anticipo && <ModalAnticipo hoy={hoy} onCerrar={() => setAnticipo(false)} onListo={(msg) => { setAnticipo(false); setOk(msg); detalle.recargar() }} />}
    </Pagina>
  )
}

function ModalAjuste({ r, onCerrar, onListo }) {
  const [importe, setImporte] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const enviar = async () => {
    setEnviando(true); setError(null)
    try {
      await rpc('crear_ajuste', { p_renglon: r.id, p_importe: Number(importe), p_motivo: motivo })
      onListo(`Ajuste de ${precio(importe)} cargado en la quincena abierta, con referencia al renglón #${r.id}.`)
    } catch (e) { setError(e) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo={`Ajustar renglón #${r.id}`} onCerrar={onCerrar}>
      <p className="text-pizarra/80">{r.descripcion} · {precio(r.importe)}</p>
      <Campo etiqueta="Importe del ajuste" ayuda="Positivo suma, negativo descuenta. Ej.: -5000" className="mt-3">
        <input className={entrada} inputMode="numeric" value={importe} onChange={(e) => setImporte(e.target.value.replace(/[^\d-]/g, ''))} />
      </Campo>
      <Campo etiqueta="Motivo" className="mt-3"><input className={entrada} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      <ErrorAccion error={error} className="mt-3" />
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Volver</Boton>
        <Boton cargando={enviando} disabled={!Number(importe) || !motivo.trim()} onClick={enviar}>Cargar ajuste</Boton>
      </div>
    </Modal>
  )
}

function ModalAnticipo({ hoy, onCerrar, onListo }) {
  const instructores = useDatos(() => q(supabase.from('instructores').select('id, nombre').order('nombre')))
  const [f, setF] = useState({ instructor_id: '', monto: '', fecha: hoy, nota: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)
  const enviar = async () => {
    setEnviando(true); setError(null)
    try {
      await q(supabase.from('anticipos').insert({ instructor_id: Number(f.instructor_id), monto: Number(f.monto), fecha: f.fecha, nota: f.nota || null }))
      onListo(`Anticipo de ${precio(f.monto)} cargado. Se descuenta en la quincena del ${fecha(f.fecha)} al recalcularla.`)
    } catch (e) { setError(e) } finally { setEnviando(false) }
  }
  return (
    <Modal abierto titulo="Cargar anticipo" onCerrar={onCerrar}>
      <div className="space-y-3">
        <Campo etiqueta="Instructor">
          <select className={entrada} value={f.instructor_id} onChange={(e) => setF({ ...f, instructor_id: e.target.value })}>
            <option value="">Elegir…</option>
            {(instructores.datos || []).map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Monto"><input className={entrada} inputMode="numeric" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value.replace(/\D/g, '') })} /></Campo>
        <Campo etiqueta="Fecha" ayuda="Se descuenta en la quincena de esta fecha"><input type="date" className={entrada} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo etiqueta="Nota (opcional)"><input className={entrada} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Campo>
      </div>
      <ErrorAccion error={error} className="mt-3" />
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar}>Volver</Boton>
        <Boton cargando={enviando} disabled={!f.instructor_id || !Number(f.monto)} onClick={enviar}>Guardar</Boton>
      </div>
    </Modal>
  )
}
