# Plan de correcciones y roadmap de notificaciones por correo con Resend

## Objetivo

Centralizar en un solo documento:

- las correcciones estructurales detectadas que impactan el flujo operativo
- el mapa de eventos del negocio que deben disparar correos
- el encaje técnico real de `Resend` en la arquitectura actual
- una propuesta de implementación por fases antes de tocar el feature

## Estado actual de la documentación

## Lo que ya existe

- `README.md` contiene contexto parcial del proyecto, RLS, recuperación de perfil Auth y algunas decisiones funcionales.
- Las migraciones en `supabase/migrations` explican bastante del modelo de datos y los triggers reales.
- No existe hoy una carpeta `docs/` funcional como fuente única de arquitectura operativa.

## Decisión recomendada

- Dejar este tipo de documentación técnica en `docs/`.
- Usar este archivo como base viva para:
  - correcciones pendientes
  - roadmap de notificaciones
  - decisiones de arquitectura sobre eventos y correos

## Hallazgos principales

## 1. Hoy no existe backend real de notificaciones

No encontré:

- integración con `Resend`
- dependencia `resend` en `package.json`
- tablas de outbox o historial de correos
- colas, workers o scheduler
- cron interno del proyecto
- centro de notificaciones persistente

Lo que sí existe hoy es UI simulada:

- `src/components/layout/Header.tsx` muestra campana estática
- `src/app/dashboard/alertas/page.tsx` usa datos mock
- `src/app/dashboard/operativo/page.tsx` usa alertas mock

## 2. Los eventos de negocio existen, pero están dispersos

Los cambios importantes del sistema hoy se producen en dos lugares distintos:

- rutas backend (`/api/...`) con cliente admin/server
- páginas cliente que escriben directo a Supabase con `createClient()`

Esto es clave porque, mientras los cambios sigan ocurriendo desde cliente, no hay un punto único y confiable para disparar correos.

## 3. El flujo de pedidos está inconsistente

### Estado inicial del pedido

En `supabase/migrations/001_schema_inicial.sql` existe el trigger `set_estado_pedido_inicial()`:

- si `empresas.requiere_aprobacion = true`, el pedido entra en `en_aprobacion`
- si `empresas.requiere_aprobacion = false`, el pedido entra en `aprobado` y se llena `fecha_aprobacion`

### Problema importante

El trigger `descontar_presupuesto_al_aprobar()` solo corre en `BEFORE UPDATE` sobre `public.pedidos`.

Eso implica que, si una empresa no requiere aprobación y el pedido nace ya en `aprobado`, ese flujo no dispara el descuento de presupuesto en el momento de creación.

Esto es un gap funcional real y debe corregirse antes o junto con las notificaciones.

### Aprobación y Odoo hoy están acoplados

La ruta `src/app/api/pedidos/[id]/aprobar/route.ts` hace todo esto en un solo paso:

- valida permisos
- lee pedido e ítems
- crea cotización en Odoo
- actualiza el pedido
- guarda `odoo_sale_order_id`
- registra trazabilidad

Pero deja el estado en `aprobado`, no en `procesado_odoo`.

### Validación Imprima existe, pero no termina en Odoo

Las páginas:

- `src/app/dashboard/gestion-pedidos/page.tsx`
- `src/app/dashboard/pedidos/[id]/page.tsx`

permiten mover el pedido a `en_validacion_imprima`, pero no encontré un flujo backend posterior que tome ese estado y cree la cotización en Odoo.

### Estado `procesado_odoo` existe, pero no es autoritativo

El estado `procesado_odoo`:

- existe en el esquema
- existe en tipos y UI
- se usa visualmente en varios dashboards

Pero no encontré código que realmente actualice `pedidos.estado = 'procesado_odoo'`.

En varias pantallas se infiere visualmente con `odoo_sale_order_id`, pero no de forma consistente.

## 4. Impacto directo en notificaciones

Mientras no haya un flujo autoritativo y coherente de estados:

- el correo correcto puede salir en el momento equivocado
- algunas transiciones pueden no disparar nada
- reportes y correos pueden no coincidir con el estado real del pedido

## Mapa de eventos que deberían disparar correos

## Prioridad alta

### 1. Alta de usuario cliente

Punto actual:

- `src/app/api/admin/empresas/[id]/usuarios/route.ts`

Evento:

- creación de usuario `comprador` o `aprobador`

Destinatarios sugeridos:

- usuario creado
- opcionalmente el actor admin que lo creó

Contenido esperado:

- acceso al portal
- rol asignado
- empresa
- contraseña temporal o instrucción de cambio

### 2. Activación de acceso para asesor

Punto actual:

- `src/app/api/admin/empresas/[id]/asesores/[asesorId]/activar-acceso/route.ts`

Evento:

- asesor interno queda habilitado en Auth y enlazado al perfil

Destinatarios sugeridos:

- asesor activado

### 3. Pedido creado y enviado a aprobación

Punto actual:

- `src/app/dashboard/carrito/page.tsx`
- trigger `set_estado_pedido_inicial()`

Condición:

- empresa con `requiere_aprobacion = true`

Destinatarios sugeridos:

- todos los usuarios activos con rol `aprobador` de la empresa
- opcionalmente confirmación al creador

Contenido esperado:

- número de pedido
- sede
- creador
- total items
- valor si aplica al rol

### 4. Pedido creado con aprobación automática

Punto actual:

- `src/app/dashboard/carrito/page.tsx`
- trigger `set_estado_pedido_inicial()`

Condición:

- empresa con `requiere_aprobacion = false`

Destinatarios sugeridos:

- creador del pedido
- asesor asignado a la empresa
- opcionalmente dirección/operación interna si no hay asesor asignado

Observación crítica:

- este flujo hoy queda operacionalmente ambiguo porque el pedido nace `aprobado`, pero no hay paso claro posterior que lo procese a Odoo de forma consistente

### 5. Pedido rechazado

Puntos actuales:

- `src/app/dashboard/aprobaciones/page.tsx`
- `src/app/dashboard/pedidos/[id]/page.tsx`

Evento:

- cambio manual a `rechazado`

Destinatarios sugeridos:

- creador del pedido
- opcionalmente otros aprobadores o responsables internos

### 6. Pedido aprobado y cotización creada en Odoo

Punto actual:

- `src/app/api/pedidos/[id]/aprobar/route.ts`

Evento real actual:

- aprobación y creación de cotización en Odoo ocurren juntas

Destinatarios sugeridos:

- creador del pedido
- aprobador que ejecutó la acción
- asesor asignado

Observación:

- el asunto y copy del correo deben reflejar la realidad actual: no es solo “aprobado”, hoy también queda sincronizado a Odoo porque ya se crea la cotización

## Prioridad media

### 7. Pedido enviado a validación Imprima

Puntos actuales:

- `src/app/dashboard/gestion-pedidos/page.tsx`
- `src/app/dashboard/pedidos/[id]/page.tsx`

Evento:

- cambio a `en_validacion_imprima`

Destinatarios sugeridos:

- creador del pedido
- aprobador principal de la empresa

Observación:

- este evento existe hoy, pero no tiene continuación backend clara hacia Odoo

### 8. Sincronización o asignación automática de asesor desde Odoo

Punto actual:

- `src/app/api/admin/empresas/[id]/asesores/sincronizar-odoo/route.ts`
- `src/lib/odoo/syncOdooAsesor.ts`

Destinatarios sugeridos:

- equipo interno
- opcionalmente asesor asignado

### 9. Errores operativos de Odoo

Eventos hoy visibles solo como intención funcional:

- fallos de sincronización
- pedidos que no logran llegar a Odoo

Destinatarios sugeridos:

- operación interna
- soporte
- dirección según severidad

## Prioridad futura

### 10. Alertas de presupuesto por umbral

Punto actual:

- `src/app/dashboard/presupuestos/page.tsx`

Hallazgo:

- hoy solo se calculan y muestran visualmente; no existe persistencia ni disparo automático

### 11. Recordatorios por pedidos estancados

Punto actual:

- solo aparecen como mock en `dashboard/operativo` y `dashboard/alertas`

Esto sí requerirá cron o un procesador recurrente.

## Soporte técnico real disponible hoy

## Sí existe

- Next.js con route handlers server-side
- cliente server/admin de Supabase
- `logs_trazabilidad` para auditoría de pedidos
- rutas backend donde sí se puede integrar `Resend`

## No existe

- cola durable
- cron interno del repo
- tabla de pendientes de envío
- reintentos
- plantillas de email
- preferencias de notificación por usuario
- tracking de enviados/fallidos

## Encaje técnico de Resend

## Encaja bien

`Resend` encaja bien en este stack porque:

- el proyecto ya usa Next.js con backend propio en `app/api`
- el envío debe ser server-only
- el volumen inicial parece transaccional, no masivo
- puede empezar simple y escalar luego con outbox + procesador

## Requisitos mínimos

- `RESEND_API_KEY`
- dominio verificado en Resend
- dirección `from` transaccional, por ejemplo `no-reply@...`
- secreto interno para el procesador si exponemos una ruta de cron

## Riesgos y consideraciones

- nunca usar `NEXT_PUBLIC_` para la API key de Resend
- nunca disparar correos desde componentes cliente
- si enviamos sin outbox, perderemos trazabilidad y reintentos
- si seguimos dejando cambios críticos directo desde cliente, habrá eventos imposibles de capturar de forma fiable

## Recomendación de arquitectura

## Opción recomendada: outbox simple + backend autoritativo

### Principio

No enviar el correo “en línea” desde UI ni depender de la pantalla que hizo el cambio.

### Recomendación concreta

1. Centralizar las mutaciones de negocio en backend.
2. En cada mutación, registrar una fila en una tabla de salida de correos.
3. Procesar esa tabla desde una ruta interna protegida.
4. Enviar con `Resend` y guardar resultado, error, intentos y `provider_message_id`.

## Tabla sugerida

Nombre sugerido:

- `notificaciones_email`

Campos sugeridos:

- `id`
- `tipo`
- `referencia_tipo`
- `referencia_id`
- `empresa_id`
- `usuario_destinatario_id`
- `email_destino`
- `asunto`
- `payload` JSONB
- `estado` (`pending`, `processing`, `sent`, `failed`, `cancelled`)
- `intentos`
- `provider`
- `provider_message_id`
- `ultimo_error`
- `disponible_desde`
- `enviada_en`
- `created_at`
- `updated_at`

Índices y protecciones:

- índice por `estado` y `disponible_desde`
- deduplicación por combinación de evento + destinatario cuando aplique

## Servicios sugeridos

- `src/lib/email/resend.ts`
- `src/lib/email/templates/...`
- `src/lib/notifications/enqueue.ts`
- `src/lib/notifications/processPending.ts`

## Ruta interna sugerida

- `src/app/api/internal/notificaciones-email/process/route.ts`

Uso:

- procesar lote de pendientes
- enviar por `Resend`
- actualizar estado
- registrar error y siguiente reintento

## Correcciones previas o simultáneas recomendadas

## P0

### 1. Definir flujo autoritativo del pedido

Hay que resolver cuál es el flujo real deseado:

### Opción A

- `en_aprobacion`
- `aprobado`
- `en_validacion_imprima`
- `procesado_odoo`

### Opción B

- `en_aprobacion`
- `procesado_odoo`

Hoy el código mezcla ambas ideas.

### 2. Corregir la auto-aprobación

Hay que corregir al menos uno de estos puntos:

- descuento de presupuesto cuando el pedido nace aprobado
- definición de quién procesa ese pedido hacia Odoo
- `aprobado_por` cuando la aprobación es automática

### 3. Hacer autoritativo `procesado_odoo`

Elegir una sola estrategia:

- persistir `estado = 'procesado_odoo'` cuando exista creación exitosa en Odoo
- o eliminar esa idea del modelo y usar solo `odoo_sale_order_id`

Mi recomendación es no dejar las dos cosas compitiendo.

### 4. Centralizar transiciones críticas en backend

Al menos estas transiciones no deberían quedar solo en páginas cliente:

- crear pedido
- rechazar pedido
- enviar a validación Imprima
- crear usuario cliente
- activar acceso asesor

## P1

### 5. Implementar outbox de correos

### 6. Implementar plantillas base

Templates iniciales sugeridos:

- bienvenida usuario cliente
- activación de asesor
- pedido recibido
- pedido rechazado
- pedido aprobado/sincronizado Odoo
- pedido en validación Imprima

### 7. Trazabilidad de envíos

Guardar por cada correo:

- destinatario
- evento
- resultado
- error
- id del mensaje en Resend

## P2

### 8. Alertas programadas

- presupuestos por umbral
- pedidos estancados
- errores Odoo
- recordatorios de aprobación

## Fase sugerida de implementación

## Fase 1

- instalar `resend`
- crear servicio server-only
- crear tabla `notificaciones_email`
- crear templates base
- disparar correos desde flujos ya server-side:
  - alta de usuario cliente
  - activación de asesor
  - aprobación con creación de cotización en Odoo

## Fase 2

- mover a backend las mutaciones que hoy suceden directo desde cliente:
  - crear pedido
  - rechazar pedido
  - enviar a validación Imprima

## Fase 3

- agregar procesador recurrente y reintentos
- activar alertas programadas
- construir centro de alertas real si se necesita canal interno dentro del portal

## Correcciones implementadas (Migración 015 + Backend autoritativo)

### ✅ 1. Trigger de presupuesto corregido

**Archivo:** `supabase/migrations/015_correccion_flujo_pedidos.sql`

- `descontar_presupuesto_al_aprobar()` ahora cubre tanto `INSERT` como `UPDATE`.
- Los pedidos auto-aprobados (empresas sin `requiere_aprobacion`) ahora descuentan presupuesto al crearse.
- Se crean dos triggers separados: `trigger_descontar_presupuesto_insert` y `trigger_descontar_presupuesto_update`.

### ✅ 2. `procesado_odoo` es ahora un estado autoritativo

**Archivo:** `src/app/api/pedidos/[id]/aprobar/route.ts`

- La ruta de aprobación ahora establece `estado = 'procesado_odoo'` cuando crea la cotización en Odoo.
- Ya no se queda en `aprobado` después de sincronizar con Odoo.

### ✅ 3. Rechazo centralizado en backend

**Archivo:** `src/app/api/pedidos/[id]/rechazar/route.ts`

- Nueva ruta `POST /api/pedidos/[id]/rechazar`.
- Valida permisos (solo `aprobador`, `super_admin`, `direccion`).
- Solo permite rechazar pedidos en estado `en_aprobacion`.
- Registra log de trazabilidad automáticamente.
- Acepta `motivo` opcional en el body.

### ✅ 4. Validación centralizada en backend

**Archivo:** `src/app/api/pedidos/[id]/validar/route.ts`

- Nueva ruta `POST /api/pedidos/[id]/validar`.
- Valida permisos (solo `asesor`, `super_admin`, `direccion`).
- Solo permite validar pedidos en estado `aprobado`.
- Verifica acceso del asesor a la empresa.
- Registra log de trazabilidad automáticamente.

### ✅ 5. Frontend actualizado

- `aprobaciones/page.tsx` → usa `/api/pedidos/[id]/rechazar` en lugar de update directo.
- `gestion-pedidos/page.tsx` → usa `/api/pedidos/[id]/validar` en lugar de update directo.
- `pedidos/[id]/page.tsx` → todas las acciones (`aprobar`, `rechazar`, `validar`) pasan por backend vía `fetch(/api/pedidos/${id}/${accion})`.

### ✅ 6. Inferencia visual eliminada

- `getPedidoEstadoVisual()` simplificada: ya solo devuelve `estado` directamente.
- `isPedidoPendienteComercial()` simplificada: ya no recibe `odoo_sale_order_id`.
- Todos los dashboards, reportes y vistas usan `pedido.estado` directamente.
- Se eliminaron todas las expresiones `odoo_sale_order_id ? 'procesado_odoo' : estado` del frontend.

### Flujo canónico de estados (definitivo)

```
CON APROBACIÓN:
  en_aprobacion → aprobado (aprobador) → en_validacion_imprima (asesor) → procesado_odoo (Odoo sync)
               → rechazado (aprobador)

  en_aprobacion → procesado_odoo (aprobador aprueba + Odoo sync en un paso)

SIN APROBACIÓN (auto):
  aprobado (trigger INSERT) → en_validacion_imprima (asesor) → procesado_odoo (Odoo sync)
  aprobado (trigger INSERT) → procesado_odoo (Odoo sync directo)
```

## Decisiones funcionales pendientes

- ¿A quién notificamos cuando una empresa no tiene aprobadores pero sí asesor asignado?
- ¿Queremos enviar copia al creador en todos los eventos o solo en cambios de estado críticos?
- ¿Los correos de error Odoo van a soporte, dirección o a un buzón operativo único?

## Decisiones funcionales cerradas

- **`procesado_odoo` es un estado persistido** en la BD, no una vista derivada de `odoo_sale_order_id`.
- **El presupuesto se descuenta** tanto en auto-aprobación (INSERT) como en aprobación manual (UPDATE).
- **Todas las transiciones críticas** (aprobar, rechazar, validar) pasan por backend autoritativo.

## Estado actual: Integración Resend

Con el flujo de pedidos ordenado, ya quedó implementada la base técnica para procesar el outbox `notificaciones_email` con Resend:

1. `src/lib/email/resend.ts`
   - cliente server-only para envío transaccional a la API de Resend
   - soporte para `APP_URL` / `NEXT_PUBLIC_APP_URL` / `VERCEL_URL` al construir links absolutos
2. `src/lib/email/templates/notificaciones.ts`
   - render HTML + texto plano para eventos de pedidos
3. `src/lib/notifications/processPendingEmails.ts`
   - procesa el outbox `notificaciones_email` por lotes
   - marca `procesando`, `enviado` o `error`
   - persiste `provider = 'resend'`, `provider_message_id`, `last_error`, `scheduled_at` y `sent_at`
4. `src/app/api/internal/notificaciones-email/process/route.ts`
   - ruta interna protegida para ejecutar el procesamiento del outbox

## Variables de entorno requeridas

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME` (opcional, default `Imprima B2B`)
- `INTERNAL_EMAIL_PROCESSOR_SECRET`
- `APP_URL` o `NEXT_PUBLIC_APP_URL` para links absolutos en los correos

## Uso operativo actual

- Las mutaciones backend siguen encolando registros en `notificaciones_email`.
- El envío real ya no depende de la UI.
- Para despachar el outbox, un scheduler externo o job protegido debe llamar:

`POST /api/internal/notificaciones-email/process`

con header:

`Authorization: Bearer <INTERNAL_EMAIL_PROCESSOR_SECRET>`

## Pendiente para activación en entorno

1. ~~cerrar el flujo real del pedido~~ ✅
2. ~~centralizar mutaciones críticas en backend~~ ✅
3. ~~montar outbox simple (tabla `notificaciones_email`)~~ ✅
4. ~~conectar el procesador con Resend~~ ✅
5. configurar secretos reales y dominio verificado en Resend
6. programar la invocación recurrente de la ruta interna

## Checklist exacto de activación para plantillas editables y envío real

### 1. Base de datos

1. Aplicar la migración `supabase/migrations/017_notificaciones_email_templates.sql`.
2. Verificar que exista la tabla `notificaciones_email_templates`.
3. Confirmar que la tabla tenga datos sembrados para todos los `TipoNotificacion` usados por pedidos.

### 2. Variables de entorno en producción

Configurar y verificar estos valores:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_FROM_NAME`
- `INTERNAL_EMAIL_PROCESSOR_SECRET`
- `CRON_SECRET`
- `APP_URL`

### 3. Resend

1. Verificar el dominio o remitente en Resend.
2. Confirmar que `RESEND_FROM_EMAIL` use exactamente un remitente permitido por Resend.
3. Hacer un envío de prueba directo desde `/admin/configuracion`.

### 4. Scheduler / cron

1. Confirmar que `vercel.json` incluya el cron hacia `/api/internal/notificaciones-email/process`.
2. Confirmar que la ruta acepte `GET` protegido con `CRON_SECRET`.
3. Verificar en Vercel que el cron quedó desplegado con la versión actual.

### 5. Editor de plantillas en superadmin

1. Entrar a `/admin/configuracion` con usuario `super_admin`.
2. Abrir la sección **Plantillas de correos de notificación**.
3. Seleccionar cada tipo de evento y validar:
   - asunto
   - título
   - intro
   - descripción
   - CTA
   - variables disponibles
   - preview HTML y texto
4. Guardar un cambio real en al menos una plantilla.
5. Recargar la pantalla y confirmar que el cambio persiste.

### 6. Validación funcional end-to-end

1. Crear o mover un pedido a un estado que dispare una notificación.
2. Confirmar que se inserte un registro en `notificaciones_email`.
3. Ejecutar manualmente **Procesar cola** desde `/admin/configuracion`.
4. Confirmar transición de estado:
   - `pendiente` → `procesando` → `enviado`
5. Revisar que `provider = 'resend'` y que exista `provider_message_id`.
6. Confirmar que el correo recibido refleje el contenido editado en la plantilla.

### 7. Demo de mañana

Orden recomendado para mostrarlo:

1. Entrar a `/admin/configuracion`.
2. Mostrar que el diagnóstico operativo de correo está en verde.
3. Abrir una plantilla, editar el asunto o CTA y guardar.
4. Mostrar que el preview cambia.
5. Disparar un evento real de pedido.
6. Procesar la cola manualmente.
7. Mostrar el correo recibido y el historial reciente en admin.

### 8. Si algo falla

- Si no guarda la plantilla, revisar primero que la migración `017_notificaciones_email_templates.sql` esté aplicada.
- Si no sale el correo, revisar `RESEND_API_KEY`, `RESEND_FROM_EMAIL` y dominio verificado.
- Si no corre automáticamente, revisar `CRON_SECRET` y la configuración desplegada en Vercel.
