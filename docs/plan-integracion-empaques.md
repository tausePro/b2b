# Plan de integración de Empaques en la plataforma B2B

## Objetivo

Documentar el contexto, decisiones iniciales, riesgos y plan de trabajo para integrar `empaques.imprima.com.co` como unidad de negocio gestionada desde la plataforma B2B, sin perder separación operativa ni afectar los flujos actuales de clientes B2B.

Este documento debe servir como fuente de contexto antes de tocar código funcional.

## Principios de trabajo

- Primero validar localmente antes de proponer despliegues o cambios productivos.
- No usar datos simulados para validar integraciones reales.
- No modificar lógica crítica de pedidos, precios, Odoo, RLS o autenticación sin una fase de análisis específica.
- No asumir estructura ni datos de Supabase: el diagnóstico de base de datos se hará con consultas SQL de solo lectura que ejecuta el usuario y cuyos resultados se revisan antes de diseñar migraciones.
- Mantener `empaques.imprima.com.co` como subdominio y unidad de negocio separada.
- Usar Odoo como fuente base del catálogo operativo.
- Agregar una capa editorial propia en Supabase para SEO, AEO, GEO, imágenes, descripciones y categorías comerciales.
- Implementar por fases pequeñas, verificables y reversibles.

## Flujo de diagnóstico Supabase

El asistente no tiene acceso directo a Supabase. Para ir a la fija:

1. Se preparan consultas SQL de solo lectura.
2. El usuario las ejecuta en Supabase SQL Editor.
3. El usuario pega los resultados completos o una muestra representativa.
4. Se interpreta el resultado antes de proponer migraciones o cambios de código.

Las consultas de diagnóstico deben evitar operaciones destructivas o mutaciones. No se deben ejecutar `insert`, `update`, `delete`, `alter`, `drop`, `truncate` ni funciones con efectos laterales durante esta fase.

## Contexto actual confirmado

La plataforma actual ya cuenta con piezas útiles para esta integración:

- Next.js App Router.
- Supabase como base de datos y autenticación.
- Integración Odoo por XML-RPC en `src/lib/odoo/client.ts`.
- Catálogo por empresa mediante `empresa_configs.configuracion_extra` y `productos_autorizados`.
- Roles internos y de cliente con guards de API en `src/lib/auth/apiRouteGuards.ts`.
- Rutas Odoo parcialmente blindadas, con acceso público limitado a búsquedas de catálogo.
- Documentación existente en `README.md` y `docs/plan-correcciones-y-notificaciones-resend.md`.
- Para Empaques sí se puede tomar la estructura de categorías desde Odoo como base inicial.
- En Odoo, `Suministros de empaque` funciona como categoría padre para las categorías/productos de empaques a exponer.
- `Cafetería` existe en Odoo como hija de `Suministros de Oficina`, pero comercialmente debe poder mostrarse en Empaques.
- En Empaques se mostrarán precios y se manejarán con margen, por lo que la unidad debe configurarse con `modo_pricing = costo_margen`.

## Hallazgos Supabase confirmados

Primer diagnóstico de solo lectura ejecutado por el usuario:

- `empresas` no tiene columna `slug`; el `slug` vive en `empresa_configs.slug`.
- `empresa_configs.slug` tiene restricción `unique`.
- `empresa_configs.configuracion_extra` es `jsonb` con default `{}`, por lo que sirve como punto de configuración reversible para un MVP.
- `empresa_configs.modo_pricing` existe como `text not null` con default `costo_margen`.
- `empresas.odoo_partner_id` es `bigint not null` y tiene restricción `unique`.
- `empresas.requiere_aprobacion` y `empresas.usa_sedes` son obligatorias.
- `productos_autorizados` ya relaciona `empresa_id` con `odoo_product_id`, pero `categoria` es obligatoria y tiene un `check` que se debe inspeccionar antes de usarla para Empaques.
- Las tablas `empresas`, `empresa_configs`, `productos_autorizados`, `usuarios` y `asesor_empresas` tienen RLS habilitado.
- Las políticas actuales permiten `insert/update/delete` principalmente a `super_admin`; `direccion` aparece con acceso de lectura amplio, pero no con escritura directa en estas tablas.
- La tabla `usuarios` tiene `check` sobre `rol`; se debe validar si `editor_contenido` existe realmente en base de datos antes de usar ese rol.
- `editor_contenido` sí existe como rol permitido en el `CHECK` de `usuarios.rol` y hay al menos un usuario con ese rol.
- `productos_autorizados.categoria` solo acepta `aseo`, `papeleria`, `cafeteria` y `personalizados`; para Empaques no debe usarse esta columna como taxonomía comercial final.
- `empresa_configs.modulos_activos` aparece en los resultados como arreglo JSON, aunque el default inicial era objeto JSON; se debe tratar con cuidado antes de depender de una forma única.
- La muestra real de empresas confirma que `modo_pricing` puede ser `costo_margen` o `pricelist`.
- No aparece una columna `pricelist_id` en las tablas consultadas; el pricing fijo se resuelve actualmente por lógica Odoo/lista y por `empresa_configs.modo_pricing`.
- Las tablas relacionadas con contenido/catálogo ya existentes son `landing_contenido`, `landing_contenido_versiones`, `margenes_venta`, `precios_empresa_producto` y `productos_autorizados`.
- `landing_contenido` y `landing_contenido_versiones` ya implementan un patrón CMS con roles `super_admin`, `direccion` y `editor_contenido`.
- `margenes_venta` y `precios_empresa_producto` son tablas de pricing por empresa y producto/categoría Odoo; no deben mezclarse con contenido editorial.
- `landing_contenido` usa campos publicados y campos de borrador (`*_borrador`, `tiene_borrador`, auditoría de borrador), más una tabla de versiones. Este patrón sirve como referencia para contenido editorial de Empaques.
- `landing_contenido` tiene lectura pública por RLS, pero para contenido editorial de productos conviene evaluar si se expone por RLS pública o mediante endpoints públicos que solo devuelvan contenido publicado.
- No existe actualmente una empresa/configuración de Empaques en Supabase.
- `configuracion_extra` solo usa hoy `mostrar_precios_aprobador`, `mostrar_precios_comprador` y `restringir_catalogo_portal`; agregar claves de Empaques sería nuevo pero compatible.
- `productos_autorizados` no tiene filas actualmente; el catálogo se consulta en tiempo real contra Odoo.
- Las empresas con catálogo restringido activo no existen actualmente.
- El endpoint actual `/api/odoo/productos` permite catálogo público solo para búsqueda textual sin `categ_ids`; si se consulta por categorías exige sesión.
- El filtro actual por categorías en Odoo usa `categ_id in (...)`, por lo que solo trae productos de categorías directas y no incluye automáticamente categorías hijas.
- Se creó el script local de diagnóstico `scripts/diagnostico-empaques-odoo.ts` para validar categorías y productos contra Odoo en modo solo lectura.
- Primer intento de diagnóstico Odoo falló porque el script usaba `.env.local` directamente. Eso no representa el flujo real de la app.
- El script se corrigió para usar el flujo real de configuración de la app: primero `odoo_configs` en Supabase y solo luego fallback a `.env.local`.
- Con la configuración real almacenada, Odoo conectó contra `OV18_IMPRIMAEE` con UID autenticado.
- La estructura real de categorías Odoo para Empaques aparece como `Soluciones de Empaques` (`id 132`) y sus hijas; también existe una categoría suelta `Empaques` (`id 127`) sin productos directos ni descendientes vendibles detectados.
- `Soluciones de Empaques` (`id 132`) tiene 219 productos vendibles al usar `child_of`.
- Las categorías hijas detectadas bajo `Soluciones de Empaques` son `128`, `129`, `134`, `135`, `137`, `139`, `140`, `141` y `142`.
- `Cafetería` real para storefront corresponde a `Suministros de Oficina / Cafetería` (`id 11`) y sus hijas `12`, `13`, `14`, `15` y `16`; se debe excluir `Gastos / Gastos Diversos / Cafeteria` (`id 103`) porque no es categoría comercial de productos.
- La combinación inicial Empaques + Cafetería arroja 1150 productos vendibles en Odoo.
- La muestra confirma que los productos traen `standard_price`, necesario para pricing `costo_margen`; también hay productos con `standard_price = 0`, que deben tratarse como riesgo operativo antes de publicar precio.
- Decisión de pricing confirmada: Empaques usará `costo_margen` como regla principal y los productos con `standard_price = 0` se manejarán con precio manual en una tabla de overrides propia del storefront.

Implicación inmediata:

- Empaques no debe crearse como empresa cliente en `empresas`, porque es una subdivisión de Imprima y no un partner/cliente atendido en Odoo.
- El modelo correcto es separar `cliente_b2b` de `storefront` o `unidad_negocio`, evitando exigir `odoo_partner_id`, sedes, presupuestos y aprobaciones.
- Antes de crear migraciones editoriales, se debe inspeccionar la estructura exacta de `landing_contenido` para reutilizar el patrón de borrador/publicación/versiones sin acoplar productos a la landing actual.
- Para el primer corte, las categorías Odoo pueden ser la fuente base de navegación. Aun así, conviene crear una capa editorial de categorías para slugs, textos SEO, imágenes, orden y casos comerciales como mostrar `Cafetería` dentro de Empaques aunque su padre técnico sea `Suministros de Oficina`.
- Para Empaques, el storefront debe resolver todas sus categorías descendientes antes de consultar productos, o usar una consulta Odoo equivalente a `child_of`.
- Para mostrar precios con margen en Empaques, no basta con el catálogo público actual: el flujo debe cargar el contexto de pricing del storefront `empaques` y aplicar `costo_margen` aun cuando el visitante no tenga sesión.
- Para implementación, usar como raíz real `Soluciones de Empaques` (`id 132`) y no depender del nombre asumido `Suministros de empaque`.
- Para Empaques, `child_of` funciona en Odoo y puede usarse para traer productos bajo la raíz `132`; alternativamente, se puede resolver descendientes en código y consultar con `categ_id in (...)`.
- Los productos cuyo `standard_price` sea `0` no deben calcular precio con margen; deben requerir `precio_override` manual antes de mostrarse con precio público.

## Decisión de arquitectura inicial

Empaques se modelará como un `storefront` o `unidad_negocio` interna, no como una fila en `empresas`.

Esta decisión evita forzar datos que no aplican:

- `odoo_partner_id`
- sedes
- presupuestos
- aprobadores/compradores
- asignación de asesor a empresa cliente
- flujos de pedidos B2B autenticados

El storefront sí reutiliza Odoo como fuente operativa de catálogo y el concepto de pricing por margen, pero con tablas propias de configuración, márgenes y overrides.

## Separación recomendada

Se recomienda introducir una distinción explícita entre:

- `cliente_b2b`: empresa cliente tradicional con usuarios compradores/aprobadores, presupuestos y pedidos internos.
- `unidad_negocio`: unidad comercial interna como Empaques, con storefront público, contenido editorial, SEO y catálogo público.

La forma elegida para esta fase es una tabla dedicada de storefronts/unidades públicas, iniciando con `storefront_configs`.

## Modelo funcional propuesto

### Subdominio

`empaques.imprima.com.co` debe resolverse hacia una experiencia pública propia, cargando configuración del storefront `Imprima Empaques`.

Configuración mínima esperada:

- subdominio público
- slug público
- logo y colores
- categorías publicadas
- productos Odoo autorizados
- metadatos SEO globales
- modo de pricing `costo_margen`
- categorías raíz Odoo a exponer
- categorías Odoo adicionales fuera de la raíz principal, como `Cafetería`

### Catálogo base

Odoo seguirá siendo fuente para:

- nombre base del producto
- SKU o referencia interna
- categoría técnica
- precio base/costo necesario para cálculo con margen
- unidad de medida
- disponibilidad de venta
- imagen base cuando exista

La plataforma no debe depender de WooCommerce como fuente operativa futura. WooCommerce servirá principalmente como referencia de estructura, contenido existente y URLs a preservar o redireccionar.

Para Empaques, la regla inicial de precio será `costo_margen`, usando tablas propias del storefront para no mezclar una unidad interna con empresas cliente B2B.

El cálculo de margen debe aplicarse en un endpoint o servicio público específico de Empaques, cargando `storefront_configs.slug = 'empaques'`. No se debe depender de sesión de comprador, `empresa_id` ni `partner_id` en el storefront público.

Jerarquía confirmada para Empaques:

1. `storefront_precios_producto.precio_override`, si existe.
2. `standard_price × (1 + margen_porcentaje / 100)`, si `standard_price > 0`.
3. Si `standard_price = 0` y no existe override, el producto debe quedar marcado como pendiente de precio manual o mostrarse sin precio hasta completar el override.

### Implementación incremental iniciada

Se creó un primer servicio público específico para Empaques, sin tocar pedidos ni flujos B2B autenticados:

- `src/lib/empaques/catalogo.ts`
- `src/app/api/empaques/catalogo/route.ts`

El endpoint público inicial es:

```txt
GET /api/empaques/catalogo
```

Parámetros soportados:

- `limit`
- `page`
- `category_id`
- `search`

Comportamiento implementado:

- Usa `getServerOdooConfig()`, por lo que respeta la configuración real de Odoo almacenada en `odoo_configs`.
- Usa `Soluciones de Empaques` (`id 132`) y `Cafetería` (`id 11`) con `child_of`.
- Excluye `Gastos / Gastos Diversos / Cafeteria` (`id 103`).
- Busca la unidad pública por `storefront_configs.slug = 'empaques'`.
- Carga márgenes y overrides desde `storefront_margenes_venta` y `storefront_precios_producto`.
- No expone `standard_price` al público.
- Devuelve `price`, `pricing_source` y `requiere_precio_manual`.
- Si no existe `precio_override` y `standard_price = 0`, devuelve `price: null`, `pricing_source: 'manual_pendiente'` y `requiere_precio_manual: true`.

También se ajustó `src/lib/supabase/middleware.ts` para declarar `/api/empaques` como ruta pública. Sin esto, el proxy redirigía el endpoint a `/login`.

Validación local:

- Servidor local activo en `http://localhost:3001`.
- `npx eslint src/lib/supabase/middleware.ts src/lib/empaques/catalogo.ts src/app/api/empaques/catalogo/route.ts src/app/layout.tsx src/lib/webmcp/inlineScript.ts` pasó correctamente.
- `npx tsc --noEmit --pretty false` pasó correctamente.
- `GET http://localhost:3001/api/empaques/catalogo?limit=3` ya responde JSON del endpoint.
- Después de aplicar `supabase/migrations/037_storefront_empaques.sql`, `GET http://localhost:3001/api/empaques/catalogo?limit=5` responde `200`.
- Storefront validado: `Imprima Empaques`, `slug = empaques`, `modoPricing = costo_margen`, raíces `[132, 11]`, excluidas `[103]`.
- Total combinado validado: `1150` productos.
- Total Empaques raíz `132`: `219` productos.
- Total Cafetería raíz `11`: `931` productos.
- Árbol raíz validado: `Empaques` con `9` hijas y `Cafetería` con `5` hijas.
- Primeros productos retornan `pricing_source = costo_margen`, `price` calculado y `requiere_precio_manual = false`.
- Búsqueda corta `search=ca` marca `searchTooShort = true`; búsqueda válida `search=caja` retorna `32` resultados.

No se debe crear Empaques desde `Admin > Empresas > Nueva Empresa`; esa pantalla corresponde a clientes B2B reales.

### Capa editorial

Se requiere una capa propia en Supabase para enriquecer productos sin modificar necesariamente Odoo.

Contenido editorial esperado por producto:

- título público
- slug público
- descripción corta
- descripción larga
- beneficios
- usos recomendados
- especificaciones visibles
- preguntas frecuentes
- metatítulo
- metadescripción
- estado de publicación
- responsable de edición
- fecha de publicación

Contenido editorial esperado por categoría:

- nombre comercial
- slug
- descripción SEO
- imagen
- orden
- categoría padre
- estado activo/inactivo
- metatítulo
- metadescripción

### Categorías comerciales

Las categorías comerciales no deben depender completamente de la taxonomía técnica de Odoo.

Ejemplos de categorías comerciales posibles:

- Cafetería
- Restaurantes
- Biodegradables
- Reciclables
- Vasos y tapas
- Bolsas personalizadas
- Cajas y contenedores
- Pitillos y cubiertos

Un mismo producto Odoo podrá pertenecer a más de una categoría comercial.

## Alcance inicial recomendado

### Fase 0: documentación y rama

- Crear este documento.
- Crear rama de trabajo aislada.
- Validar estado local sin tocar lógica funcional.

### Fase 1: diagnóstico técnico antes de implementar

- Revisar esquema actual de `empresas`, `empresa_configs`, `productos_autorizados` y RLS.
- Revisar rutas públicas actuales y `PublicLayout`.
- Revisar cómo se resuelve catálogo público desde `/api/odoo/productos`.
- Revisar flujos admin de empresa y selección de productos Odoo.
- Identificar migraciones necesarias con mínimo impacto.

### Fase 2: modelo de datos mínimo

Definir migración para soportar, como mínimo:

- unidad de negocio o tipo de empresa
- configuración de subdominio
- categorías editoriales
- contenido editorial por producto
- imágenes editoriales por producto

Antes de crear migraciones se debe validar si conviene usar columnas reales o `configuracion_extra` para MVP.

### Fase 3: administración editorial

Construir interfaz interna para:

- seleccionar productos Odoo que harán parte de Empaques
- crear y ordenar categorías comerciales
- asignar productos a categorías comerciales
- editar contenido editorial de producto
- subir o asociar imágenes editoriales
- manejar estados `borrador` y `publicado`

Roles candidatos:

- `super_admin`
- `direccion`
- `editor_contenido`, si se formaliza ese rol en base de datos y RLS

### Fase 4: storefront público de Empaques

Crear experiencia pública para:

- home de Empaques
- listado de productos
- detalle de producto
- páginas de categoría
- metadata SEO
- JSON-LD para producto, breadcrumb y preguntas frecuentes cuando aplique

El storefront debe priorizar contenido editorial publicado y complementar con datos Odoo.

### Fase 5: automatización asistida con IA

Agregar generación asistida de borradores para:

- descripciones
- beneficios
- FAQs
- metatítulos
- metadescripciones
- texto de categoría
- alt text de imágenes

La publicación debe requerir revisión humana.

### Fase 6: migración SEO desde WooCommerce

- Levantar URLs actuales relevantes desde sitemap de WooCommerce.
- Mapear URLs viejas contra nuevas rutas.
- Preservar slugs cuando sea conveniente.
- Crear redirecciones 301.
- Generar sitemap nuevo.
- Validar indexabilidad.

## Riesgos identificados

### Riesgo: mezclar Empaques con B2B tradicional

Si Empaques se trata como cliente B2B normal, puede heredar flujos que no aplican: aprobaciones, presupuestos, usuarios compradores o sedes.

Mitigación:

- Marcar Empaques como unidad de negocio.
- Separar storefront público de dashboard cliente.

### Riesgo: duplicar fuente de verdad del catálogo

Si se edita información operativa en Supabase y Odoo al mismo tiempo, se puede perder consistencia.

Mitigación:

- Odoo queda como fuente operativa.
- Supabase queda como capa editorial/publicación.

### Riesgo: romper SEO del WooCommerce actual

Cambiar rutas sin redirecciones puede perder posicionamiento.

Mitigación:

- Inventariar URLs actuales.
- Crear mapa de redirecciones.
- Preservar slugs relevantes.

### Riesgo: publicar contenido generado automáticamente sin revisión

Puede afectar marca, precisión comercial o cumplimiento.

Mitigación:

- IA solo crea borradores.
- Publicación manual con trazabilidad.

### Riesgo: exponer endpoints internos de Odoo

Empaques requiere catálogo público, pero no debe ampliar exposición de Odoo ni datos sensibles.

Mitigación:

- Mantener límites públicos.
- Crear endpoints públicos específicos para Empaques si es necesario.
- Validar permisos y campos retornados.

## Checklist antes de tocar código funcional

- Confirmar rama activa.
- Confirmar árbol Git limpio o con solo documentación esperada.
- Revisar migraciones previas relevantes.
- Revisar RLS aplicable.
- Revisar flujos actuales de catálogo por empresa.
- Identificar si existe rol `editor_contenido` en base de datos, no solo en tipos de API.
- Definir si el MVP usará `configuracion_extra` o migraciones normalizadas.
- Definir qué productos/categorías Odoo entran al primer piloto.

## Validación local mínima por fase

### Para cambios de documentación

- `npm run lint`
- `git status --short`

### Para cambios de migración

- Revisar SQL manualmente.
- Validar que las políticas RLS no abran acceso indebido.
- Probar contra entorno local o staging antes de producción.

### Para cambios frontend/backend

- `npm run lint`
- `npm run build`
- Validación manual de rutas públicas.
- Validación manual de rutas admin con rol autorizado.
- Validación de endpoints sin sesión para confirmar que no exponen datos sensibles.

## Primeras tareas sugeridas después de este documento

1. Auditar tablas y migraciones relacionadas con empresas, configuraciones y productos autorizados.
2. Diseñar migración mínima para unidad de negocio y contenido editorial.
3. Crear pantalla admin inicial para contenido editorial de Empaques.
4. Crear resolución de subdominio o configuración de storefront.
5. Agregar botón `Empaques` junto a `Acceso B2B` en el header público.

## Estado

- Rama de trabajo: `feat/empaques-unidad-negocio`.
- Documento inicial creado para preservar contexto.
- No se ha modificado lógica funcional.
- Pendiente: validación local y resumen antes de avanzar a implementación.
