import { useEffect, useState } from 'react'
import { Clock, RotateCcw, Save, FastForward, CloudSnow, TriangleAlert } from 'lucide-react'
import { rpc, supabase } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { precio, momento } from '../../lib/formato'
import { Pagina } from '../../components/Layout'
import { useDatos, q, Cargando, ErrorAccion, Tarjeta, Titulo, Boton, Campo, entrada, Aviso, Seccion, Modal } from '../../components/ui'

const TORMENTA = '2027-07-10T06:30:00-04:00'   // sábado de tormenta del briefing, hora de Chile

export default function Configuracion() {
  const { reloj, actualizarReloj } = useSesion()
  const datos = useDatos(async () => {
    const [config, tarifas, productos, extras, cuentas] = await Promise.all([
      q(supabase.from('configuracion').select('*').single()),
      q(supabase.from('tarifas_instructor').select('*').order('categoria')),
      q(supabase.from('productos').select('id, nombre, precio, precio_por').order('orden')),
      q(supabase.from('extras').select('*').order('id')),
      q(supabase.from('perfiles').select('nombre, rol').neq('rol', 'cliente').order('rol')),
    ])
    return { config, tarifas, productos, extras, cuentas }
  })
  const [c, setC] = useState(null)
  const [ok, setOk] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(null)
  const [reiniciar, setReiniciar] = useState(false)
  useEffect(() => { if (datos.datos) setC(structuredClone(datos.datos)) }, [datos.datos])

  const hacer = async (clave, fn, msg) => {
    setOcupado(clave); setError(null); setOk(null)
    try { await fn(); setOk(msg); actualizarReloj(); datos.recargar() } catch (e) { setError(e) } finally { setOcupado(null) }
  }
  const fijar = (momentoIso) => hacer('reloj', () => rpc('fijar_reloj', { p_momento: momentoIso }), momentoIso ? 'Reloj de demostración actualizado.' : 'El sistema volvió a la hora real.')
  const adelantar = (horas) => fijar(new Date(new Date(reloj.ahora).getTime() + horas * 3600e3).toISOString())

  if (datos.cargando && !c) return <Cargando />
  if (datos.error) return <Pagina><ErrorAccion error={datos.error} onActualizar={datos.recargar} /></Pagina>
  if (!c) return <Cargando />
  const cf = c.config
  const setCf = (k) => (e) => setC({ ...c, config: { ...cf, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value } })

  const guardarConfig = () => hacer('config', async () => {
    const { id, actualizado_en, reloj_simulado, reloj_fijado_en, ...resto } = cf
    await q(supabase.from('configuracion').update({ ...resto, actualizado_en: new Date().toISOString() }).eq('id', 1))
  }, 'Configuración guardada. Los cambios valen para las reservas nuevas.')
  const guardarPrecios = () => hacer('precios', async () => {
    for (const t of c.tarifas) await q(supabase.from('tarifas_instructor').update({ tarifa_hora: Number(t.tarifa_hora) }).eq('categoria', t.categoria))
    for (const p of c.productos) await q(supabase.from('productos').update({ precio: Number(p.precio) }).eq('id', p.id))
    for (const x of c.extras) await q(supabase.from('extras').update({ precio: Number(x.precio), costo_unitario: Number(x.costo_unitario) }).eq('id', x.id))
  }, 'Precios y tarifas guardados.')

  return (
    <Pagina ancho="max-w-4xl">
      <Titulo sub="Solo administración modifica estos datos (lo controla la base, no solo la pantalla).">Configuración</Titulo>
      <ErrorAccion error={error} onActualizar={datos.recargar} />
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <Seccion titulo="Reloj de demostración">
        <Tarjeta className={reloj?.simulado ? 'ring-2 ring-alerta' : ''}>
          <p className="flex items-center gap-2 text-lg"><Clock className="size-5" /> Ahora el sistema funciona como si fuera el <strong>{momento(reloj?.ahora)}</strong> {reloj?.simulado ? '(simulado, avanza en tiempo real)' : '(hora real)'}.</p>
          <p className="mt-1 text-sm text-pizarra/70">Sirve para reproducir el sábado de tormenta y probar vencimientos sin esperar: todo usa este reloj (vencimientos de 24 h, lista de espera de 12 h, cargos de proveedores y mínimos por clima).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton variante="alerta" cargando={ocupado === 'reloj'} onClick={() => fijar(new Date(TORMENTA).toISOString())}><CloudSnow className="size-4" /> Sábado de tormenta · 10/07 06:30</Boton>
            <Boton variante="secundario" onClick={() => adelantar(12)}><FastForward className="size-4" /> +12 horas</Boton>
            <Boton variante="secundario" onClick={() => adelantar(24)}><FastForward className="size-4" /> +24 horas</Boton>
            <Boton variante="texto" onClick={() => fijar(null)}>Usar hora real</Boton>
          </div>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Temporada y reglas">
        <Tarjeta>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Inicio de temporada"><input type="date" className={entrada} value={cf.temporada_inicio} onChange={setCf('temporada_inicio')} /></Campo>
            <Campo etiqueta="Fin de temporada"><input type="date" className={entrada} value={cf.temporada_fin} onChange={setCf('temporada_fin')} /></Campo>
            <Campo etiqueta="Vacaciones de invierno: desde"><input type="date" className={entrada} value={cf.alta_inicio} onChange={setCf('alta_inicio')} /></Campo>
            <Campo etiqueta="Vacaciones de invierno: hasta"><input type="date" className={entrada} value={cf.alta_fin} onChange={setCf('alta_fin')} /></Campo>
            {[
              ['recargo_alta_pct', 'Recargo temporada alta (% sobre clases)'], ['reintegro_mas_72_pct', 'Reintegro con más de 72 h (%)'],
              ['reintegro_24_72_pct', 'Reintegro entre 72 y 24 h (%)'], ['reintegro_menos_24_pct', 'Reintegro con menos de 24 h (%)'],
              ['horas_pago', 'Horas para pagar una reserva'], ['horas_espera', 'Horas para confirmar desde la lista de espera'],
              ['edad_minima', 'Edad mínima'], ['max_horas_dia', 'Máximo de horas de clase por día'],
              ['minutos_entre_centros', 'Minutos libres entre centros'], ['max_dias_seguidos', 'Días seguidos máximos (1 libre cada 7)'],
              ['adicional_ninos_pct', 'Adicional clases de chicos (%)'], ['adicional_ingles_pct', 'Adicional clases en inglés (%)'],
              ['minimo_clima_horas', 'Mínimo por clima (horas)'], ['cargo_proveedor_pct', 'Cargo a proveedores con menos de 24 h (%)'],
              ['plazas_camioneta', 'Plazas por camioneta'],
            ].map(([k, label]) => (
              <Campo key={k} etiqueta={label}><input type="number" step="any" className={entrada} value={cf[k]} onChange={setCf(k)} /></Campo>
            ))}
          </div>
          <Boton className="mt-4" cargando={ocupado === 'config'} onClick={guardarConfig}><Save className="size-4" /> Guardar reglas</Boton>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Precios y tarifas (pesos chilenos)">
        <Tarjeta>
          <h3 className="font-bold text-glaciar">Tarifa por hora de instructor</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {c.tarifas.map((t, i) => (
              <Campo key={t.categoria} etiqueta={`Nivel ${t.categoria}`} ayuda={precio(t.tarifa_hora)}>
                <input className={entrada} inputMode="numeric" value={t.tarifa_hora} onChange={(e) => { const tarifas = [...c.tarifas]; tarifas[i] = { ...t, tarifa_hora: e.target.value.replace(/\D/g, '') }; setC({ ...c, tarifas }) }} />
              </Campo>
            ))}
          </div>
          <h3 className="mt-4 font-bold text-glaciar">Productos</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {c.productos.map((p, i) => (
              <Campo key={p.id} etiqueta={`${p.nombre} (por ${p.precio_por})`} ayuda={precio(p.precio)}>
                <input className={entrada} inputMode="numeric" value={p.precio} onChange={(e) => { const productos = [...c.productos]; productos[i] = { ...p, precio: e.target.value.replace(/\D/g, '') }; setC({ ...c, productos }) }} />
              </Campo>
            ))}
          </div>
          <h3 className="mt-4 font-bold text-glaciar">Extras (precio al cliente / costo de la escuela)</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {c.extras.map((x, i) => (
              <div key={x.id} className="space-y-2">
                <Campo etiqueta={`${x.nombre}: precio`}><input className={entrada} inputMode="numeric" value={x.precio} onChange={(e) => { const extras = [...c.extras]; extras[i] = { ...x, precio: e.target.value.replace(/\D/g, '') }; setC({ ...c, extras }) }} /></Campo>
                <Campo etiqueta={x.codigo === 'traslado' ? 'Costo por camioneta' : 'Costo por persona'}><input className={entrada} inputMode="numeric" value={x.costo_unitario} onChange={(e) => { const extras = [...c.extras]; extras[i] = { ...x, costo_unitario: e.target.value.replace(/\D/g, '') }; setC({ ...c, extras }) }} /></Campo>
              </div>
            ))}
          </div>
          <Boton className="mt-4" cargando={ocupado === 'precios'} onClick={guardarPrecios}><Save className="size-4" /> Guardar precios</Boton>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Cuentas internas">
        <Tarjeta>
          <p className="text-sm text-pizarra/70">El rol de cada cuenta se asigna desde la base; nadie lo elige ni lo cambia desde un formulario público.</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {c.cuentas.map((x) => <li key={x.nombre + x.rol}><strong>{x.nombre}</strong> · {x.rol}</li>)}
          </ul>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Datos de ejemplo">
        <Tarjeta className="ring-2 ring-alerta">
          <p>Borra reservas, órdenes y liquidaciones y vuelve a cargar los datos de ejemplo (temporada 2027 y el sábado de tormenta). Las cuentas de prueba se mantienen.</p>
          <Boton variante="alerta" className="mt-3" onClick={() => setReiniciar(true)}><RotateCcw className="size-4" /> Reiniciar datos de ejemplo</Boton>
        </Tarjeta>
      </Seccion>
      <Modal abierto={reiniciar} titulo="¿Reiniciar datos?" onCerrar={() => setReiniciar(false)}>
        <Aviso tipo="alerta"><TriangleAlert className="inline size-4" /> Se pierden todos los cambios hechos en la demo.</Aviso>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setReiniciar(false)}>Volver</Boton>
          <Boton variante="alerta" cargando={ocupado === 'reiniciar'} onClick={async () => { await hacer('reiniciar', () => rpc('reiniciar_datos_demo'), 'Datos de ejemplo cargados de nuevo.'); setReiniciar(false) }}>Sí, reiniciar</Boton>
        </div>
      </Modal>
    </Pagina>
  )
}
