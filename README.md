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
