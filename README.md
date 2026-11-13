This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Configuración de catálogo por empresa (portal cliente)

Desde **Admin > Empresas > Configuración > Productos Odoo** ahora se puede:

1. Marcar productos individuales como visibles en portal (check **Portal** en cada tarjeta).
2. Activar **Restringir catálogo a selección** para que el cliente vea solo esos productos.
3. Definir visibilidad de precios por rol cliente:
   - **Precios visibles para sucursales** (rol `comprador`)
   - **Precios visibles para aprobador** (rol `aprobador`)

La configuración se guarda en `empresa_configs.configuracion_extra` y la selección de productos en `productos_autorizados`.

Claves usadas en `configuracion_extra`:

- `restringir_catalogo_portal` (boolean)
- `mostrar_precios_comprador` (boolean)
- `mostrar_precios_aprobador` (boolean)

## Blindaje de pedidos (RLS)

La política `pedido_items_insert` valida ahora la regla de catálogo restringido en base de datos:

- Si `restringir_catalogo_portal = false`, permite insertar cualquier `odoo_product_id` del pedido.
- Si `restringir_catalogo_portal = true`, solo permite productos activos en `productos_autorizados` para esa empresa.

Migración: `supabase/migrations/012_blindaje_pedido_items_portal.sql`.

## Idempotencia de pedidos y sincronización Odoo

La migración `supabase/migrations/045_pedidos_idempotencia_odoo.sql` debe aplicarse antes de desplegar el código que la consume. Agrega:

- Llave de idempotencia por usuario para impedir pedidos duplicados por doble envío o reintentos.
- Claim atómico de sincronización para evitar dos `sale.order` concurrentes para el mismo pedido.
- Unicidad de `odoo_sale_order_id` y serialización de la numeración `PED-AAAA-NNNN`.

La antigüedad del costo se lee directamente desde Odoo mediante `last_purchase_date`, `last_purchase_days` y `last_purchase_days_label`. El semáforo replica los rangos de Odoo: 0–30 verde, 31–60 azul, 61–90 amarillo y más de 90 rojo.

ARIS MINING SEGOVIA usa `modo_pricing = 'pricelist'`; sus precios de venta provienen exclusivamente de la lista asignada en Odoo y no del esquema costo+margen.

## Configurador de Empaques Personalizados

La migración `supabase/migrations/046_empaques_personalizados.sql` debe aplicarse antes de desplegar el configurador. Crea el detalle estructurado de las solicitudes y el bucket privado `empaques-solicitudes`.

- Vista pública: `/empaques/personalizados` y `/personalizados` desde el subdominio de Empaques.
- La migración adicional `supabase/migrations/049_empaques_tiff_por_cara.sql` debe aplicarse completa antes de desplegar la selección acotada y la carga TIFF. Conserva las solicitudes antiguas y sus JPG/PNG/WEBP/PDF.
- Solo ofrece las seis referencias kraft configuradas en Supabase. El área imprimible es fija por referencia y no representa las dimensiones físicas de la bolsa.
- Producción utiliza los SKU `2300100105` (una cara) o `2300100190` (dos). Muestra utiliza `2300100191` para ambas opciones, sin duplicar el servicio por cara.
- Requiere un TIFF para frente o dos TIFF separados para frente/reverso. Valida mínimo 150 ppp efectivos, recomienda 300 y ajusta proporcionalmente dentro del área, sin recortar ni estirar.
- Los originales privados se suben directamente a Storage con autorización temporal sin sobrescritura. Se aceptan hasta 100 MiB por original y 64 millones de píxeles, sujetos a límites de memoria/procesamiento; el límite global de Storage también debe permitirlo.
- El servidor verifica TIFF, genera PNG sRGB sin metadatos privados y conserva el SHA-256 del original. La vista previa es orientativa, no una prueba de color sobre kraft.
- Crea un lead con fuente `empaques_personalizados` mediante registro transaccional e idempotente y ofrece continuidad por WhatsApp. No acepta archivos sin validación o reutilizados en otra solicitud.
- No crea productos ni cotizaciones en Odoo y no calcula precios automáticos.
- Referencias y textos se gestionan desde Admin > Empaques > Landing; los cambios parciales conservan el catálogo configurado.
- Admin > Leads muestra referencia, servicio, áreas y vistas previas por cara; originales y previews se consultan mediante URLs firmadas temporales.
- Reservas: 12 cargas por origen en 30 minutos y 500 globales en 24 horas. Autorizaciones de dos horas; las cargas abandonadas caducadas hace más de 25 horas se limpian oportunistamente al iniciar otras, sin borrar archivos de leads.
- `npm run test:empaques` verifica el decodificador y contratos sin subir archivos. `npm run test:empaques:integration` es de solo lectura y requiere la 049 aplicada. El flujo completo debe validarse después con un arte real y un envío autorizado.

## Usuarios cliente multiempresa

La migración `supabase/migrations/047_usuarios_multiempresa.sql` debe aplicarse antes del código. Mantiene la empresa principal existente y agrega asociaciones con rol y sedes por empresa.

- Un mismo correo puede operar como comprador o aprobador en distintas empresas.
- Cada asociación define varias sedes autorizadas y una sede predeterminada opcional.
- El header permite cambiar la empresa activa y actualiza rol, branding, catálogo y visibilidad de precios.
- El carrito se almacena por usuario y empresa para impedir cruces de productos o tarifas.
- Pedidos, aprobaciones, presupuestos y notificaciones validan empresa, rol y sede en backend y RLS.
- Al asociar un correo existente no se crea una segunda cuenta de autenticación.
- Retirar una empresa no desactiva al usuario mientras conserve otras asociaciones activas.

Validación:

```bash
npm test
npm run test:multiempresa:integration
npm run build
```

## Comisión habitual por categoría

Desde v2.14.24, **Comisiones y bono plataforma** y el resumen financiero de Gerencia muestran la comisión habitual desglosada por asesora y categoría:

- **Soluciones de Empaques**: 2% para la categoría Odoo 132 y todos sus descendientes.
- **Tóner genéricos**: 2% para la categoría Odoo 26 y todos sus descendientes.
- **General**: 1% para las demás categorías identificadas. Las líneas sin categoría confirmada se muestran pendientes.
- **Margen menor al 15%** (desde v2.14.30, para todas las fechas): las líneas de categoría general con margen bruto por línea (utilidad ÷ venta sin IVA, redondeado a dos decimales) menor al 15% comisionan 0,5%. Tóner genéricos y Empaques conservan el 2% sin importar el margen. Si la línea no tiene costo verificado, su comisión queda pendiente. En octubre de 2026 la regla bajó la comisión del equipo de 6.609.628 a 6.493.058 (79 líneas).
- La base es la venta neta sin IVA en COP; las notas crédito conservan su signo y reducen la comisión.
- Empaques muestra el mes de facturación y el mes calendario siguiente como pago previsto, sin asignar un día ni registrar un pago.

La tasa depende de la categoría de cada línea, también para las ventas de Vanesa. Su asignación al storefront no extiende el 2% de Empaques a productos de otras categorías.

`GET /api/comisiones/habitual` permite a cada asesora consultar únicamente su vendedor Odoo vinculado. Dirección y Super Admin pueden consultar el equipo o una asesora. La comisión habitual es informativa y permanece separada del bono plataforma del 0,5% y sus liquidaciones. Este release no requiere migraciones nuevas.

## Utilidad bruta en Gerencia

La utilidad bruta de ventas equivale al margen firmado de Odoo (`margin_signed`): venta neta sin IVA menos el costo registrado en cada línea de factura o nota crédito.

- Los servicios (productos Odoo de tipo `service`: rentas, mantenimientos, envíos, etc.) sin costo registrado se toman con costo cero por definición de Gerencia y no quedan por revisar.
- La mercancía con costo cero suma su venta completa como utilidad, igual que en Odoo, y se señala para revisión: KPI, aviso con la utilidad sin esas líneas, resumen de productos por revisar y filtro del detalle.
- Los costos ausentes, negativos, con cantidad cero o que no concilian con la línea o la cabecera siguen pendientes y dejan la utilidad total sin presentar.
- El filtro `pendientes_costo=1` lista mercancía con costo cero y costos pendientes; no cambia los KPI ni los resúmenes.
- La consulta se limita a la compañía activa del usuario Odoo de la integración (hoy INVERSIONES IMPRIMA SAS); no mezcla documentos de VALU OLIVEROS SAS.
- `GET /api/gerencia/finanzas` responde en formato compacto: `advisors`, `clients`, `products` y `costReview.products` llegan como `{ fields, rows }` y el cliente los reconstruye con `decodeFinancialReport`. `costReview` resume `zeroCostGoods*`, `zeroCostService*` y los productos por revisar con su categoría. En rangos de más de 62 días la evolución se agrupa por mes (`trendGranularity`).
- No se completan costos con el `standard_price` actual ni se modifica Odoo.

Conciliación de octubre de 2026: venta 607.606.414,28, costo 400.610.438,47 y utilidad 206.995.975,81, iguales a Odoo. De las 41 líneas con costo cero, 33 son servicios (7.123.920) y 8 mercancía por revisar (1.966.300). La respuesta de octubre pasó de 714.681 a 245.392 bytes.

## Seguimiento de leads (v2.14.47)

- `/admin/leads` y `/dashboard/leads` usan `LeadsDashboard` (propuesta de Leads): indicadores (sin contactar con plazo de 2 h, leads de 30 días vs los 30 anteriores, conversión con meta del 20 %, peso de Google Ads), embudo por estado que filtra, origen de los leads con su atribución, búsqueda, filtros en chips, vista Lista o Tablero y panel de detalle (acciones de WhatsApp, llamada y correo, estado, asesora, empaque personalizado, atribución y actividad). Lógica pura en `src/lib/leads/seguimiento.ts`.
- La migración manual 056 agrega `leads.asignado_a`, `leads.contactado_at` y la tabla `lead_eventos`. Sin ella, todo funciona salvo la asignación, el tiempo de respuesta y el historial de notas (el API responde `features.seguimiento=false` y la nota se guarda en `leads.notas`). Al asignar, la asesora recibe un aviso push.

## Propuesta de Gerencia: escritorio y PWA (v2.14.42)

- Menú agrupado (`src/lib/navigation/menu.ts`, sin JSX y probado contra `routeAccess`): Gerencia, Comercial, Operación y Sistema para Dirección; grupos equivalentes para Super Admin, asesoras, Compras, Cartera y Editor; el portal de clientes queda sin encabezados. Multi-rol fusiona grupos y quita repetidos. Alertas muestra el contador de notificaciones sin leer (`useUnreadNotifications`, una sola suscripción compartida con el encabezado).
- Buscador ⌘K / Ctrl K (`CommandPalette`, `<dialog>` nativo con `closedby="any"` y alternativa `useLightDismiss`): opciones del menú del rol y `GET /api/buscar` (pedidos y clientes del portal con la RLS de la sesión; clientes y productos de Odoo, solo lectura, según el rol). Enlaces directos: `/dashboard/productos-cliente?cliente=<id>` y `/dashboard/compras?producto=<id>`.
- Resumen ejecutivo: pestañas Resumen (`/dashboard`), Rentabilidad (`/dashboard/gerencia`), Cartera y Comisiones (`GerenciaTabs`); período Mes en curso / Mes anterior / Año a la fecha (`buildPeriodKpis`, sin consultas extra); gráfico de 12 meses con margen sobre las barras; "Requiere atención" (borradores, pedidos con más de 15 días sin facturar, cartera vencida a más de 90 días, mercancía con costo cero); cartera hoy con antigüedad; por facturar por asesora; pedidos con antigüedad y mes a mes plegado. `/dashboard/por-facturar` lista todos los pedidos con filtros en chips y los borradores.
- Celular (perfiles internos): barra inferior con 4 destinos (Dirección: Resumen, Ventas, Pedidos por facturar, Cartera) y "Más" con el perfil y el menú agrupado; indicadores en carrusel, gráfico de 6 meses y tablas como tarjetas. `--mobile-nav-offset` reserva el espacio de la barra.

## Resumen ejecutivo de Gerencia (v2.14.36)

- `/dashboard` para Dirección y Super Admin muestra arriba `ResumenEjecutivo` y deja el análisis detallado (`GerenciaFinanzas`) plegado; solo carga al abrirlo (se abre solo si la URL trae filtros). `/dashboard/gerencia` conserva la vista detallada completa.
- `GET /api/gerencia/resumen` (`loadExecutiveSummary`, caché 60 s, solo lectura con `read_group`): mes en curso comparado con el mismo período (día 1 a hoy) del mes anterior y del año anterior; mes a mes de 12 meses con variación vs mes anterior y vs mismo mes del año anterior; usa los totales de cabecera de Odoo (`amount_untaxed_signed`, `cost_total`, `margin_signed`) de facturas publicadas, incluidas notas crédito.
- Facturas en borrador: `account.move` en `draft` (facturas y notas crédito de clientes, no cuentan en ventas). Pendiente por facturar: Σ `untaxed_amount_to_invoice` de líneas `to invoice` de pedidos confirmados (saldo sin IVA, decisión de Gerencia), con los 10 pedidos de mayor saldo y el total por asesora. Por cobrar/pagar reutiliza `/api/gerencia/cartera` (cifra del tablero de Odoo).
- PWA: el aviso de instalación también aparece en computador cuando el navegador permite instalar (Chrome/Edge).

## PWA y notificaciones push (v2.14.34)

- El portal se puede instalar (Android, iPhone, escritorio): `public/manifest.webmanifest`, íconos en `public/pwa/`, service worker `public/sw.js` (push, clic que abre la ruta y página `/offline.html`; no guarda en caché páginas ni datos). `PwaHead` agrega manifest y metadatos solo en login, dashboard y admin; la landing y Empaques no son instalables.
- Guía pública para compartir: `https://b2b.imprima.com.co/instalar` (sin sesión, `noindex`). Muestra primero los pasos del dispositivo que la abre (iPhone/iPad con Safari › Compartir › Agregar a pantalla de inicio; Android; computador), avisa si se abrió dentro de otra app (WhatsApp, Gmail…), ofrece "Instalar ahora" donde el navegador lo permite y botones para compartir o copiar el enlace. El aviso de instalación de iPhone y Mi Perfil enlazan a esta guía.
- Cada usuario activa las notificaciones de su dispositivo en **Mi Perfil › Aplicación y notificaciones** (activar, desactivar, enviar prueba e instalar). En iPhone solo funcionan con el portal agregado a la pantalla de inicio (iOS 16.4+).
- Eventos: todos los de `enqueuePedidoNotifications` (mismo destinatario, título, descripción y ruta que la notificación interna: pedido por aprobar, aprobado, rechazado, procesado, pedidos de clientes de la asesora) y lead nuevo para Dirección (rol principal o extra). Un fallo de push nunca bloquea pedidos, leads ni correos.
- Suscripciones en `push_suscripciones` (migración manual 055, solo service role); 404/410 desactivan el dispositivo. Llaves en Vercel (Producción): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (sensible) y `VAPID_SUBJECT`. Sin llaves, el portal informa que no está configurado.

## Compras con proveedores y rol Compras

- `/dashboard/compras` (asesoras, Dirección, Super Admin y rol `compras`) busca productos y muestra el historial de órdenes de compra confirmadas (`purchase.order` en estado `purchase`/`done`) de los últimos 12 meses, por fecha de la orden y solo de la compañía activa de Odoo. Muestra costo más bajo (proveedor, fecha y orden), último costo, promedio ponderado por cantidad y el detalle.
- Costo unitario = `price_subtotal ÷ product_qty` (sin IVA, con descuentos), convertido a la unidad del producto (`uom.uom.factor`) y a COP con `purchase.order.currency_rate`. Se excluyen y avisan las líneas sin cantidad, sin costo (bonificaciones), sin fecha, sin tasa o con unidad no convertible. API: `GET /api/compras/historial?buscar=` y `?producto_id=` (solo lectura).
- Rol `compras` (migración manual 054): Compras con proveedores, Pedidos (lectura de todos, sin aprobar ni validar) y Catálogo con costos. No ve leads, comisiones ni Gerencia. La migración solo agrega políticas SELECT.

## Cuentas por cobrar y por pagar en Gerencia

- Desde v2.14.29, la cifra principal de cada lado es la de "facturas pendientes" del tablero de Contabilidad de Odoo (decisión de Gerencia): suma el valor total (`amount_total_signed`) de las facturas publicadas no pagadas o con pago parcial de los diarios de facturas, incluidas sus propias notas crédito. Las facturas con abonos cuentan por su valor completo. Los diarios que nunca han tenido facturas (solo notas crédito, p. ej. "Nota Crédito Electronica") se muestran aparte. El 2026-11-04 cuadró al peso con Odoo en por cobrar (897.365.461,25).
- La sección "Composición y antigüedad" concilia esa cifra con el saldo contable: abonos parciales, notas crédito de diarios dedicados y pagos/anticipos/otros asientos sin conciliar.
- Por decisión de Gerencia se excluye la cartera castigada que sigue abierta en Odoo: asiento `I/2025/12/0487` (id 235543; FAST COLOMBIA, ULTRA AIR y sin tercero, 169.057.255). La regla está en `EXCLUDED_WRITTEN_OFF_MOVES` y solo aplica si el id y el nombre del asiento coinciden.
- Saldo contable: saldos abiertos actuales (`amount_residual`) de las cuentas Odoo tipo por cobrar y por pagar, publicados hasta hoy, de la compañía activa del usuario de la integración. Es el mismo criterio del informe de antigüedad de Odoo, sin la cartera castigada excluida.
- Los anticipos configurados en esas cuentas se compensan en el saldo neto; la sección "Composición y antigüedad" muestra el saldo por cuenta contable.
- Antes del 2026-11-04 se sumaban también los saldos de VALU OLIVEROS SAS (+43.342.535 por cobrar y +254.242.053 por pagar). Al 2026-11-04, INVERSIONES IMPRIMA SAS: por cobrar 1.016.602.317,13 (clientes 1.045.569.929,00 menos anticipos de clientes 28.967.611,87) y por pagar 430.241.005,11 (proveedores 417.999.224,21 más otras cuentas por pagar 32.810.724,54 menos anticipos a proveedores 20.568.943,64).
- Las retenciones, impuestos y obligaciones laborales del PUC (clases 13, 23 y 24) no son cuentas tipo por cobrar o por pagar en Odoo y no se incluyen.

## Bono Plataforma para asesoras

La migración `supabase/migrations/048_bono_plataforma_asesoras.sql` habilita el bono adicional del 0,5% desde septiembre de 2026.

- Solo participan empresas activas con asignación de asesora y al menos un usuario cliente activo.
- La base proviene exclusivamente de líneas facturadas en Odoo que estén vinculadas a pedidos originados en el portal.
- El cálculo usa el saldo firmado de líneas de producto sin IVA, validando que la moneda de compañía sea COP. No usa el total visual del portal ni incluye facturas completas cuando contienen ventas externas.
- Las notas crédito se buscan también por su factura original. Ajustes sin trazabilidad, líneas mixtas y saldos que requieren conciliación bloquean el cierre; no se prorratean ni se descartan silenciosamente.
- Las asesoras solo consultan su liquidación; Dirección y Super Admin revisan el equipo completo.
- Los periodos son provisionales durante el mes y solo se cierran después del corte en America/Bogota. Marcar pagada registra un pago externo, no ejecuta transferencias.
- Cada cierre congela nombres, importes y enlaces a líneas de Odoo. Reabrir conserva el cierre anterior en el historial; las transiciones son transaccionales y validan la versión revisada.
- Si la facturación o elegibilidad cambia después de revisar, el cierre exige actualizar y confirmar otra vez. La elegibilidad provisional se consulta con los accesos activos actuales.

Validación:

```bash
npm test
npm run test:bono:odoo
npm run test:bono:integration
npm run build
```

`test:bono:odoo` consulta datos reales de solo lectura y puede verificar la política aprobada antes del backfill. `test:bono:integration` requiere la migración 048 aplicada; las pruebas de cierre, RLS autenticada y reapertura requieren además validación funcional autorizada.

## Recuperación automática de perfil Auth

Se agregó una contingencia para el error **"Perfil no encontrado"** cuando el `auth.users.id` cambia pero `public.usuarios.auth_id` quedó desincronizado.

- Nueva función RPC: `enlazar_mi_usuario_por_email()` (SECURITY DEFINER).
- Esta función toma el email del JWT autenticado y relinka `usuarios.auth_id = auth.uid()` cuando encuentra el perfil por email.

Migración: `supabase/migrations/013_auto_enlace_perfil_por_email.sql`.

## Portales cliente (comprador/aprobador)

Mejoras implementadas en dashboard cliente:

- `Facturas`: vista con pedidos en ciclo de facturación (`aprobado`, `en_validacion_imprima`, `procesado_odoo`) y estado por pedido.
- `Soporte`: canales de contacto + tabla de pedidos recientes para escalar incidencias con contexto.
- `Reportes`: KPIs de últimos 60 días, distribución por estado y top sedes por volumen.
- Guard de acceso por rol en layout dashboard para bloquear rutas no habilitadas por perfil.

### Checklist de pruebas manuales (portal cliente)

1. Ingresar como `comprador`:
   - Ver menú: Catálogo, Mis Pedidos, Facturas, Soporte.
   - Confirmar que `/dashboard/aprobaciones` y `/dashboard/reportes` muestren mensaje de acceso no permitido.
2. Ingresar como `aprobador`:
   - Ver menú: Dashboard, Aprobaciones, Pedidos, Presupuestos, Reportes.
   - Confirmar que `/dashboard/catalogo` muestre acceso no permitido.
3. Validar visibilidad de precios por empresa/rol:
   - `mostrar_precios_comprador = false` oculta valores en Facturas/Reportes para comprador.
   - `mostrar_precios_aprobador = true|false` refleja cambio en vistas del aprobador.
4. Validar blindaje RLS de items:
   - Con `restringir_catalogo_portal = true`, insertar item no autorizado debe fallar en `pedido_items`.

## Hardening incremental de `/api/odoo/*`

Se aplicó una primera fase de blindaje sobre la superficie HTTP de Odoo para reducir exposición pública sin romper los flujos actuales del portal y del admin.

### Qué quedó protegido

- `/api/odoo/pricelists`, `/api/odoo/importar-clientes`, `/api/odoo/test`, `/api/odoo/config`, `/api/odoo/clientes` y `/api/odoo/categorias` ahora requieren sesión válida y rol interno autorizado.
- `/api/odoo/productos` mantiene soporte público solo para el catálogo abierto (`search` con límite acotado) y exige sesión para consultas contextualizadas por `partner_id`, `pricelist_id`, etiquetas o diagnóstico interno.
- Las consultas autenticadas a `/api/odoo/productos` validan además que el `partner_id` solicitado pertenezca a la empresa del usuario o a su cartera autorizada.

### Verificación local ejecutada

Sobre `http://localhost:3001` se validó lo siguiente:

- `/login` responde `200`.
- `/dashboard` sin sesión redirige a `/login` (`307`).
- `/api/odoo/productos?search=papel&limit=3` responde `200` como catálogo público.
- `/api/odoo/pricelists` sin sesión responde `401`.
- `/api/odoo/importar-clientes` sin sesión responde `401`.
- `/api/odoo/productos?partner_id=15&limit=1` sin sesión responde `401`.

### Riesgos residuales / siguiente fase

- Sigue pendiente verificar manualmente los flujos autenticados por rol (`super_admin`, `direccion`, `asesor`, `comprador`, `aprobador`) con credenciales locales reales.
- `src/app/admin/sincronizacion/page.tsx` todavía carga `odoo_configs` directo desde cliente; aunque RLS limita el acceso, la siguiente fase debería mover esa lectura sensible a backend y evitar exponer credenciales completas en UI.
- Falta endurecer validación de secretos/SSRF de Odoo y revisar si conviene retirar `/api/odoo` de `publicPaths` una vez que las excepciones públicas queden totalmente encapsuladas.
- Falta complementar este blindaje HTTP con endurecimiento de BD/RLS para cualquier nueva superficie administrativa que use `service role`.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
