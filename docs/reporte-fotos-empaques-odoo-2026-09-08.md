# Reporte de fotografías de productos — Empaques (2026-09-08)

Medición de solo lectura sobre `product.template.image_1024` de Odoo para los productos visibles en el storefront público de Empaques. Odoo nunca escala hacia arriba: si el original es menor a 512 px, todas las variantes (`image_512`, `image_1024`, `image_1920`) devuelven esa misma foto pequeña y se verá borrosa en cualquier tarjeta (~290–360 px CSS, el doble o triple en pantallas retina).

- Productos visibles: 30
- Sin fotografía (ni Odoo ni editorial): 0
- Con fotografía en Odoo: 30
- Original < 512 px (**resubir en Odoo con ≥ 1024 px** o cargar imagen editorial): 7
- Original 512–1023 px (aceptable; suave en retina): 9
- Original ≥ 1024 px: 14

## Críticos: original menor a 512 px

| Odoo ID | Referencia | Producto | Categoría | Original (px) | Formato | Editorial |
|---|---|---|---|---|---|---|
| 7178 | 2300100001 | (C60451) BOLSA MAXIBAG X 35 KL | Soluciones de Empaques / Empaques para Granos y Polvos Reciclable | 218×231 | jpeg 6 KB | no |
| 10222 | 2300400024 | (T01483)AL-18 TAPA CAZUELA REDONDA GRANDE X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 256×172 | jpeg 9 KB | no |
| 10341 | 2300400026 | (T01429) AL-138B TAPA BAJA TRES DIVISONES EN BOPS X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 279×183 | jpeg 14 KB | no |
| 10937 | 2300400040 | (TO0091) AL-45 BASE EMPAQUE PARA POSTRES 150 GRAM X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 415×278 | jpeg 12 KB | no |
| 10936 | 2300400039 | (TO0092) AL-45 TAPA EMPAQUE PARA POSTRES 150 GRM X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 415×278 | jpeg 12 KB | no |
| 11337 | 2300400045 | (T01194) AL-27 TAPA DOMO EMPAQUE EN BOPS | Soluciones de Empaques / Porta Alimentos Reciclable | 481×296 | jpeg 28 KB | no |
| 11338 | 2300400046 | (T00072) AL-27 BASE PARA POLLO EN BOPS | Soluciones de Empaques / Porta Alimentos Reciclable | 507×298 | jpeg 29 KB | no |

## Aceptables: original entre 512 y 1023 px

| Odoo ID | Referencia | Producto | Categoría | Original (px) | Formato | Editorial |
|---|---|---|---|---|---|---|
| 8776 | 2300400004 | (T01050) AL-139 BASE EMPAQUE SOPA EN BOPS X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 600×500 | jpeg 59 KB | no |
| 9945 | 2300400013 | (T00327) AL-47 TAPA ALTA EN BOPS X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 720×720 | jpeg 21 KB | no |
| 7895 | 2300400001 | (T01043) AL-138 TAPA TRES DIVISIONES EN BOPS X 80 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 720×720 | png 22 KB | no |
| 8774 | 2300400002 | (T01044) AL-138 BASE TRES DIVISIONES EN BOPS NEGRO X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 720×720 | jpeg 45 KB | no |
| 8775 | 2300400003 | (T01049) AL-139 TAPA EMPAQUE SOPA EN BOPS X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 720×720 | png 17 KB | no |
| 9977 | 2300400017 | (T00137) AL-133 TAPA EMPAQUE 64 ONZAS EN BOPS X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 752×484 | png 253 KB | no |
| 8780 | 2300400008 | (T00816) AL-123 BASE BANDEJA CARNE EN PS X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 783×507 | jpeg 35 KB | no |
| 8779 | 2300400007 | (T00817) AL-123 TAPA BANDEJA CARNE EN PET X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 783×507 | jpeg 35 KB | no |
| 10010 | 2300400020 | (T00658) AL-55 TAPA EMPAQUE EN BOPS X 100 UND | Soluciones de Empaques / Porta Alimentos Reciclable | 1000×1000 | jpeg 294 KB | no |

## Sin fotografía

_Ninguno._
