# CDSKI · Sistema de temporada de una escuela de nieve

Sistema web para una escuela independiente de esquí y snowboard con base en Lo Barnechea. Cubre toda la temporada, desde que alguien reserva una clase hasta que se le paga al instructor y al proveedor. Tiene cinco módulos conectados (**reservas, operación, proveedores, liquidaciones e informes**) en 18 pantallas, pensadas primero para el celular.

- **Frontend:** React 19 + Vite + Tailwind CSS 4 (carpeta `src/`)
- **Base de datos y usuarios:** Supabase (PostgreSQL + Auth). Las reglas del negocio viven en la base, en `supabase/migrations/`
- **Publicación:** Vercel (`vercel.json` ya redirige todas las rutas a la SPA)

---

## 1. Cómo arrancarlo

### a) Base de datos (Supabase)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. **Authentication → Sign In / Providers → Email:** desactiva **Confirm email**. No se mandan correos: ni de confirmación ni de recuperación.
3. En **SQL Editor**, ejecuta en este orden el contenido de cada archivo:
   ```
   supabase/migrations/001_esquema.sql
   supabase/migrations/002_seguridad.sql
   supabase/migrations/003_reservas.sql
   supabase/migrations/004_operacion.sql
   supabase/migrations/005_liquidaciones.sql
   supabase/migrations/006_informes.sql
   supabase/migrations/007_ajustes_seguridad.sql
   supabase/seed.sql          ← datos de ejemplo y cuentas de prueba
   ```
   Con la CLI de Supabase también funciona: `supabase db push` y después el seed.

### b) Aplicación

```bash
cp .env.example .env.local     # completa la URL y la clave publicable de tu proyecto
npm install
npm run dev                    # http://localhost:5173
```

`.env.example` solo tiene los nombres de las variables y valores de prueba. Se usa la **clave publicable** (`sb_publishable_…`). La clave `service_role` no se usa en ningún lado: no va en el navegador ni en el repositorio.

### c) Publicar en Vercel

Importa el repositorio en Vercel (Framework: Vite) y carga las dos variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.

---

## 2. Cuentas de prueba

Todas usan la contraseña **`Nieve2027`**. En la pantalla de ingreso hay botones para completarlas con un toque.

| Rol | Correo | Qué ve |
|---|---|---|
| Cliente | `cliente@cdski.test` (Camila Soto) | Sus reservas y créditos. Tiene 2 reservas en el sábado de tormenta. |
| Cliente | `cliente2@cdski.test` (Diego Araya) | Está primero en una lista de espera y tiene una solicitud de heliesquí. |
| Operaciones | `operaciones@cdski.test` | Tablero, asignación, reservas y pagos, solicitudes, clima e informes. |
| Administración | `admin@cdski.test` | Todo lo anterior, más liquidaciones y configuración. |
| Instructor | `instructor@cdski.test` (Tomás Pizarro, Nivel 2) | Solo su agenda, sus clases y su liquidación. |
| Instructor | `instructor2@cdski.test` (Sofía Valenzuela, Nivel 3) | Ídem. |
| Proveedor | `proveedor@cdski.test` (Traslados Cordillera Uno) | Solo sus órdenes y su liquidación. |
| Proveedor | `proveedor2@cdski.test` / `proveedor3@cdski.test` | Arriendo Nieve Sur / Altura Vuelos. |

Hay además 14 clientes sintéticos (`cliente03@cdski.test` … `cliente16@cdski.test`). Cada cuenta tiene **un solo rol**, guardado en la tabla `perfiles`. El registro público siempre crea cuentas de **cliente**: el rol lo asigna la base (trigger `al_crear_usuario`) y un trigger impide que alguien cambie su propio rol.

---

## 3. Reloj de demostración (cómo se prueba el clima y los vencimientos)

### Para qué sirve

Varias reglas dependen de la fecha y la hora:
- el cierre por clima registrado **ese día después de las 6:00** (mínimo para el instructor);
- las órdenes a proveedores con **menos de 24 h** (cargo del 50%);
- las reservas pendientes que **vencen a las 24 h**;
- las **12 h** que tiene el primero de la lista de espera para confirmar;
- la anticipación de una **cancelación** (100%, 50% o 0%).

La temporada de prueba es del **20/06/2027 al 27/09/2027**, con temporada alta del 04/07 al 26/07. Para probar esas reglas sin esperar al invierno ni a que pasen las horas, el sistema tiene un **reloj de demostración**: administración elige qué día y hora "es" para la escuela, y todo el sistema funciona como si fuera ese momento.

### Cómo se usa

1. Ingresa como `admin@cdski.test` → **Configuración** → **Reloj de demostración**.
2. Elige un botón:
   - **Sábado de tormenta · 10/07 06:30:** deja el sistema en el momento del briefing, el sábado 10/07/2027 a las 06:30 (hora de Chile). Es el estado en que quedan los datos de ejemplo.
   - **+12 horas** / **+24 horas:** adelanta el reloj, para ver vencer una reserva pendiente sin esperar.
   - **Usar hora real:** apaga la simulación y el sistema vuelve a la fecha y hora reales.
3. Mientras el reloj está simulado, todas las pantallas muestran arriba una **franja naranja** con la fecha y hora simuladas.

El reloj simulado **avanza en tiempo real** desde que se fija: si lo fijas a las 06:30, una hora después marca 07:30. Si pasó mucho tiempo desde la última prueba, aprieta de nuevo *Sábado de tormenta*. El botón *Reiniciar datos de ejemplo* también lo deja en 06:30.

### Ejemplos para probar

- **Cierre por clima:** con el reloj en el sábado 10/07 06:30, sigue los pasos de la sección 4.
- **Vencimiento a las 24 h y lista de espera:** el domingo 11/07, la clase grupal medio día de principiantes en Centro Portezuelo está **Completa**. Tiene una reserva pendiente de pago que vence 2 h después de las 06:30 y dos personas en lista de espera. Aprieta **+12 horas** y abre el **Tablero del día** como operaciones. La reserva pasa a **Vencida**, libera su cupo y Diego Araya (`cliente2@cdski.test`), el primero en espera, recibe una reserva pendiente con **12 horas** para confirmar. La ves en *Reservas y pagos → Lista de espera* y en *Mi cuenta* de Diego.
- **Cancelación:** Camila (`cliente@cdski.test`) tiene una reserva para el 12/07 a las 14:00 (a unas 55 h: reintegro del **50%**) y otra para el 21/07 (más de 72 h: **100%**).

### Cómo funciona por dentro

- La configuración guarda el momento simulado (`configuracion.reloj_simulado`) y el instante real en que se fijó (`reloj_fijado_en`).
- La función `public.ahora()` devuelve `reloj_simulado + (now() − reloj_fijado_en)`. Si no hay simulación, devuelve `now()`.
- Todas las funciones del negocio usan `ahora()`, `hoy_chile()` y `ahora_chile()` en lugar de `now()`. Por eso las reglas de tiempo se comportan igual con el reloj simulado que con la hora real.
- Solo administración puede cambiar el reloj (`fijar_reloj`). En producción basta con dejarlo en **Usar hora real**.

---

## 4. El sábado de tormenta (caso del briefing)

Los datos de ejemplo dejan armado el sábado **10/07/2027** en **Centro Quebrada Alta**:

- **41 alumnos en 9 grupos** (13 reservas confirmadas y pagadas), con instructor asignado en cada grupo.
- **2 camionetas** pedidas a Traslados Cordillera Uno (18 pasajeros, una cada 12) y **6 equipos** más 3 ropas de nieve pedidos a Arriendo Nieve Sur.
- Un grupo completo con una persona en lista de espera.

**Cómo reproducirlo:**

1. Ingresa como `operaciones@cdski.test`. Si pasó tiempo, entra primero como admin y aprieta *Sábado de tormenta* en Configuración.
2. **Clima** → Centro Quebrada Alta, fecha 10/07/2027 → **Ver qué se afecta**. Antes de confirmar ves:
   - 13 reservas y 41 alumnos.
   - 9 grupos con su instructor y el mínimo de cada uno, que suma **$156.000** (1 h de su tarifa porque el cierre es ese día después de las 6:00).
   - 3 pedidos con **cargo del 50%** por faltar menos de 24 h: traslado $190.000, equipos $72.000 y ropa $16.500, en total **$278.500**.
3. Escribe el motivo y **Confirmar cierre**. Resultado:
   - Las 13 reservas pasan a **Afectada por clima**.
   - Las 3 órdenes pasan a **Cancelada con cargo**.
   - La lista de espera de ese día se cancela.
   - Repetir el cierre no vuelve a cancelar ni a cobrar nada.
4. Como `cliente@cdski.test`, en **Mi cuenta** cada reserva afectada ofrece **Reprogramar** o **Crédito 100%**, nunca ambos. Reprogramar vuelve a comprobar el cupo y el instructor, y la reserva nueva queda vinculada al cierre.
5. Como admin, en **Liquidaciones → quincena 01/07–15/07 → Recalcular**, cada instructor tiene su renglón *Mínimo por clima* y cada proveedor su *Cancelación con cargo*.

---

## 5. Ejemplo de liquidación (Tomás Pizarro, Nivel 2, $18.000/h)

Quincena **01/07/2027 – 15/07/2027**, con los datos de ejemplo, en **Administración → Liquidaciones** o en la cuenta `instructor@cdski.test` → **Mi liquidación**:

| Fecha | Concepto | Cálculo | Importe |
|---|---|---|---:|
| 03/07 | Clase grupal medio día · Portezuelo | 3 h × $18.000 (hubo un ausente: se paga igual) | $54.000 |
| 04/07 | Programa chicos · Portezuelo | 3 h × $18.000 | $54.000 |
| 04/07 | Adicional chicos | 10% de $54.000 | $5.400 |
| 05/07 | Anticipo | se descuenta en la quincena en que se carga | −$50.000 |
| 07/07 | Particular de esquí · Los Nevados | 2 h × $18.000 | $36.000 |
| 07/07 | Adicional inglés | 5% de $36.000 | $1.800 |
| 08/07 | Programa chicos en inglés · Quebrada Alta | 3 h × $18.000 | $54.000 |
| 08/07 | Adicional chicos | 10% de $54.000 | $5.400 |
| 08/07 | Adicional inglés | 5% de $54.000 | $2.700 |
| 27/06 | **Ajuste** de la quincena 16/06–30/06 (ya pagada) | la clase del 27/06 se dictó en inglés: falta el 5% de $54.000 | $2.700 |
| | **Total antes del cierre por clima** | | **$166.000** |
| 10/07 | Mínimo por clima · Programa chicos · Quebrada Alta | 1 h × $18.000 (después de aplicar el cierre y recalcular) | $18.000 |
| | **Total después del cierre** | | **$184.000** |

La quincena 16/06–30/06 está **pagada y bloqueada**. Después de pagarla aparecieron dos correcciones: la clase en inglés de Tomás y una orden de Arriendo Nieve Sur que se marcó cumplida tarde ($144.000). Ninguna toca la quincena pagada: entran como **renglones de ajuste** en la quincena abierta, con referencia al renglón original.

---

## 6. Qué está simulado

| Qué | Cómo funciona |
|---|---|
| **Pagos** | No se cobra de verdad. Operaciones registra cada pago a mano (medio, fecha y referencia) en **Reservas y pagos**. Los reintegros por cancelación también quedan como registros. |
| **Avisos** | No se mandan correos ni SMS. Cada aviso es una confirmación en pantalla, un botón **Compartir por WhatsApp** con el texto ya armado (abre `wa.me` para elegir el contacto) y la descarga de un archivo **.ics** para el calendario. |
| **Mapas** | No hay. El punto de encuentro de cada centro es un texto. |
| **Tareas programadas** | No hay. La función `mantenimiento()` vence las pendientes sin pago, libera el cupo, ofrece el lugar al siguiente en espera y pasa reservas a *En curso* / *Finalizada*. Se ejecuta al abrir el **Tablero del día**, **Mi cuenta** y **Reservas**. |
| **Proveedores** | Las órdenes se calculan solas al confirmar o cancelar reservas: una camioneta cada 12 pasajeros, y equipos y ropa por persona. El proveedor las acepta y las marca cumplidas desde su cuenta. |
| **Heliesquí** | Se cotiza. Al pagar, se genera la orden a Altura Vuelos y operaciones confirma el clima el día anterior con un botón. |

---

## 7. Cómo reiniciar los datos de ejemplo

- **Desde la app:** Administración → Configuración → **Reiniciar datos de ejemplo**. Borra reservas, órdenes y liquidaciones, vuelve a cargar todo y deja el reloj en el sábado de tormenta. Las cuentas de prueba se mantienen, así que nadie pierde la sesión.
- **Desde Supabase:** vuelve a ejecutar `supabase/seed.sql` en el SQL Editor (o `select demo.cargar();`).

---

## 8. Dónde está cada cosa

```
supabase/
  migrations/
    001_esquema.sql          tablas: producto → turno → reserva → participante → clase,
                             orden de servicio, quincena → renglón de liquidación
    002_seguridad.sql        roles, RLS de todas las tablas y catálogo público limitado
    003_reservas.sql         reloj, cupos, lista de espera, pagos, cancelaciones, solicitudes,
                             habilitaciones y límites de instructores
    004_operacion.sql        asignación, grupos paralelos, cierre por clima, reprogramación/crédito,
                             asistencia y órdenes
    005_liquidaciones.sql    renglones con origen, ajustes automáticos y manuales, bloqueo de quincenas
    006_informes.sql         7 informes con filtro de fechas
    007_ajustes_seguridad.sql
  seed.sql                   datos sintéticos + cuentas de prueba (schema `demo`)
src/
  lib/          supabase.js (cliente; la sesión vive en sessionStorage), formato.js ($64.000, fechas),
                avisos.js (.ics y WhatsApp), csv.js, errores.js, sesion.jsx
  components/   ui.jsx (botones, estados con ícono + texto, modal…), Layout.jsx, Cumbres.jsx (SVG)
  pages/        publico/ cliente/ instructor/ proveedor/ operaciones/ admin/
```

### Las 18 pantallas

| # | Ruta | Rol | Pantalla |
|---|---|---|---|
| 1 | `/` | público | Inicio (gradientes fríos, cumbres en SVG, catálogo) |
| 2 | `/productos/:codigo` | público | Producto y turnos del día (Disponible / Últimos lugares / Completo) |
| 3 | `/reservar/:codigo` | público → cliente | Asistente de reserva en 4 pasos |
| 4 | `/ingresar` | público | Ingreso y registro (siempre como cliente) |
| 5 | `/mi-cuenta` | cliente | Reservas, créditos, lista de espera y pendientes |
| 6 | `/mi-cuenta/reservas/:id` | cliente | Detalle: cancelar, reprogramar o crédito, .ics y WhatsApp |
| 7 | `/instructor` | instructor | Agenda (alto contraste y botones grandes) |
| 8 | `/instructor/clases/:id` | instructor | Asistencia (presente/ausente) y cierre de la clase |
| 9 | `/instructor/liquidacion` | instructor | Mi liquidación renglón por renglón |
| 10 | `/proveedor` | proveedor | Mis órdenes (aceptar / cumplida) y mi liquidación |
| 11 | `/operaciones` | operaciones, admin | Tablero del día |
| 12 | `/operaciones/asignacion` | operaciones, admin | Asignación de instructores y grupos paralelos |
| 13 | `/operaciones/reservas` | operaciones, admin | Reservas, pagos manuales y lista de espera |
| 14 | `/operaciones/solicitudes` | operaciones, admin | Heliesquí y jornadas corporativas (cotizar y confirmar clima) |
| 15 | `/operaciones/clima` | operaciones, admin | Cierre por clima con vista previa |
| 16 | `/admin/liquidaciones` | admin | Quincenas, aprobación, pago, ajustes y anticipos |
| 17 | `/admin/informes` | operaciones, admin | 7 informes + CSV |
| 18 | `/admin/configuracion` | admin | Reglas, precios, reloj de demostración y reinicio |

---

## 9. Reglas y dónde se validan

Todas las acciones que tocan cupo, saldo o estado se resuelven en **una sola función de la base**. Cada función valida el estado actual y, si una regla falla, rechaza la acción sin dejar cambios a medias. Repetir la misma confirmación no vuelve a cobrar, consumir ni liberar nada:
- Las reservas usan una clave de envío.
- Los pagos y los créditos tienen índices únicos.
- Cancelar o cerrar dos veces devuelve el resultado anterior.

Si hay un conflicto, la pantalla que hizo la acción lo muestra con un botón **Actualizar datos**.

| Regla | Función |
|---|---|
| Edad mínima de 7 años, niveles iguales (con propuesta de dividir), rango de edad del programa chicos | `validar_personas` (y también en el asistente) |
| Cupo por participante, etiqueta de disponibilidad, lista de espera por orden de llegada | `crear_reserva`, `disponibilidad`, `unirse_lista_espera` |
| Vencimiento a las 24 h y oferta de 12 h al siguiente en espera | `mantenimiento`, `ofrecer_lugares` |
| Recargo del 20% en temporada alta solo sobre clases | `calcular_montos` |
| Habilitaciones (N1: Principiante/Intermedio; N2: + Avanzado; N3: Experto, salidas guiadas y heliesquí; Apto niños; disciplina; inglés) | `evaluar_instructor` |
| Sin superposición, 45 min entre centros, 6 h por día, 1 día libre cada 7, con justificación escrita | `evaluar_instructor`, `asignar_instructor` (tabla `justificaciones_asignacion`) |
| Cancelación: más de 72 h → 100%, entre 72 y 24 h → 50%, menos de 24 h → 0% | `calcular_cancelacion`, `cancelar_reserva` |
| Cierre por clima, reprogramar **o** crédito del 100% | `vista_previa_cierre`, `aplicar_cierre_clima`, `reprogramar_reserva`, `elegir_credito_clima` |
| Órdenes a proveedores: más de 24 h → sin cargo; menos de 24 h → 50% | `cancelar_orden_interna`, `sincronizar_ordenes` |
| No presentados: sin reintegro y la clase se paga igual | `cerrar_clase`, `calcular_renglones` |
| Quincena pagada bloqueada y ajustes en la quincena abierta | trigger `bloquear_quincena_pagada`, `generar_liquidacion`, `crear_ajuste` |

### Seguridad (RLS)

**Todas** las tablas tienen RLS. Las políticas usan funciones de la base que leen el rol del usuario conectado:

- Un **cliente** lee solo sus reservas, sus participantes, sus pagos y sus créditos.
- Un **instructor** lee solo sus clases y las reservas de esas clases.
- Un **proveedor** lee solo sus órdenes y sus renglones.
- **Operaciones** y **administración** leen todo.
- Las liquidaciones, la configuración, los precios y los anticipos solo los escribe **administración**.

Cambiar un identificador en la consulta no da acceso a otras filas. El catálogo público (productos, centros, extras, temporada y disponibilidad) se expone con funciones que devuelven solo los campos permitidos, nunca la tabla completa.

---

## 10. Supuestos y decisiones

- **Temporada 2027:** la de 2026 ya pasó, así que se usó 2027 para poder reservar de verdad. El reloj de demostración permite reproducir cualquier momento.
- **Clases de nivel Experto:** solo las da un instructor Nivel 3. El briefing dice que el Nivel 2 suma Avanzado.
- **Turnos:** los grupales nacen la primera vez que alguien reserva esa combinación de centro, fecha, hora, nivel y disciplina, con el cupo del producto. Los particulares y las salidas guiadas tienen un grupo por instructor libre.
- **Jornada corporativa:** admite niveles mezclados (es una actividad de empresa) y crea un instructor cada 6 participantes.
- **Crédito por clima:** es el 100% de lo pagado, extras incluidos, y se usa en la misma temporada.
- **Orden de llegada estricta en la lista de espera:** si el primero necesita más lugares de los que se liberaron, el resto espera.
- **Interfaz en español de Chile neutro** (tuteo) y precios en pesos con el formato $64.000.
