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

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
