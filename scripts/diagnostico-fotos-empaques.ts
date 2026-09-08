// Diagnóstico de solo lectura: recorre el catálogo VISIBLE del storefront de
// Empaques (misma lógica que la tienda: raíces, exclusiones, ocultos
// editoriales, pricelist) y mide la resolución real de la foto en Odoo.
// Escribe docs/reporte-fotos-empaques-odoo-<fecha>.md. No modifica Odoo ni Supabase.
// Ejecutar: node --conditions=react-server --import tsx scripts/diagnostico-fotos-empaques.ts
import { config } from 'dotenv';
config({ path: '.env.local' });

import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { authenticate, read } from '../src/lib/odoo/client';
import { getServerOdooConfig } from '../src/lib/odoo/serverConfig';
import { EMPAQUES_MAX_LIMIT, getEmpaquesCatalogData, type EmpaquesCatalogProduct } from '../src/lib/empaques/catalogo';

type Fila = {
  id: number;
  ref: string;
  nombre: string;
  categoria: string;
  editorial: boolean;
  width: number;
  height: number;
  formato: string;
  kb: number;
};

const kb = (bytes: number) => Math.round(bytes / 1024);

async function main() {
  const productos: EmpaquesCatalogProduct[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await getEmpaquesCatalogData({ page, limit: EMPAQUES_MAX_LIMIT });
    productos.push(...data.productos);
    totalPages = data.totalPages;
    page += 1;
  } while (page <= totalPages);

  console.log(`Productos visibles en el storefront: ${productos.length}`);
  const sinFoto = productos.filter((p) => !p.has_image && !p.image_url);
  const conOdoo = productos.filter((p) => p.has_image);
  console.log(`Sin fotografía (ni Odoo ni editorial): ${sinFoto.length}`);
  console.log(`Con fotografía en Odoo: ${conOdoo.length}`);

  const odooConfig = await getServerOdooConfig();
  if (!odooConfig) throw new Error('Sin configuración Odoo');
  const session = await authenticate(odooConfig);

  const filas: Fila[] = [];
  const porProducto = new Map(conOdoo.map((p) => [p.id, p]));
  const ids = conOdoo.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    const rows = await read('product.template', lote, ['id', 'image_1024'], session);
    for (const row of rows) {
      const producto = porProducto.get(Number(row.id));
      if (!producto || typeof row.image_1024 !== 'string') continue;
      const buffer = Buffer.from(row.image_1024, 'base64');
      const meta = await sharp(buffer).metadata();
      filas.push({
        id: producto.id,
        ref: producto.default_code || '',
        nombre: producto.name,
        categoria: producto.categ_id ? producto.categ_id[1] : '',
        editorial: Boolean(producto.image_url),
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        formato: meta.format ?? '?',
        kb: kb(buffer.length),
      });
    }
    process.stdout.write(`  medidos ${Math.min(i + 20, ids.length)}/${ids.length}\r`);
  }
  console.log('');

  const lado = (f: Fila) => Math.max(f.width, f.height);
  const criticos = filas.filter((f) => lado(f) < 512).sort((a, b) => lado(a) - lado(b));
  const medios = filas.filter((f) => lado(f) >= 512 && lado(f) < 1024).sort((a, b) => lado(a) - lado(b));
  const ok = filas.filter((f) => lado(f) >= 1024);

  console.log(`\nOriginal < 512 px (críticos): ${criticos.length}`);
  console.log(`Original 512–1023 px (aceptable, suave en retina): ${medios.length}`);
  console.log(`Original ≥ 1024 px (ok): ${ok.length}`);
  console.log(`Con imagen editorial que reemplaza la de Odoo: ${filas.filter((f) => f.editorial).length}`);

  const tabla = (items: Fila[]) => [
    '| Odoo ID | Referencia | Producto | Categoría | Original (px) | Formato | Editorial |',
    '|---|---|---|---|---|---|---|',
    ...items.map((f) => `| ${f.id} | ${f.ref || '—'} | ${f.nombre.replace(/\|/g, '/')} | ${f.categoria.replace(/\|/g, '/')} | ${f.width}×${f.height} | ${f.formato} ${f.kb} KB | ${f.editorial ? 'sí' : 'no'} |`),
  ].join('\n');

  const fecha = new Date().toISOString().slice(0, 10);
  const md = [
    `# Reporte de fotografías de productos — Empaques (${fecha})`,
    '',
    'Medición de solo lectura sobre `product.template.image_1024` de Odoo para los productos visibles en el storefront público de Empaques. Odoo nunca escala hacia arriba: si el original es menor a 512 px, todas las variantes (`image_512`, `image_1024`, `image_1920`) devuelven esa misma foto pequeña y se verá borrosa en cualquier tarjeta (~290–360 px CSS, el doble o triple en pantallas retina).',
    '',
    `- Productos visibles: ${productos.length}`,
    `- Sin fotografía (ni Odoo ni editorial): ${sinFoto.length}`,
    `- Con fotografía en Odoo: ${conOdoo.length}`,
    `- Original < 512 px (**resubir en Odoo con ≥ 1024 px** o cargar imagen editorial): ${criticos.length}`,
    `- Original 512–1023 px (aceptable; suave en retina): ${medios.length}`,
    `- Original ≥ 1024 px: ${ok.length}`,
    '',
    '## Críticos: original menor a 512 px',
    '',
    criticos.length ? tabla(criticos) : '_Ninguno._',
    '',
    '## Aceptables: original entre 512 y 1023 px',
    '',
    medios.length ? tabla(medios) : '_Ninguno._',
    '',
    '## Sin fotografía',
    '',
    sinFoto.length
      ? ['| Odoo ID | Referencia | Producto | Categoría |', '|---|---|---|---|', ...sinFoto.map((p) => `| ${p.id} | ${p.default_code || '—'} | ${p.name.replace(/\|/g, '/')} | ${p.categ_id ? p.categ_id[1].replace(/\|/g, '/') : ''} |`)].join('\n')
      : '_Ninguno._',
    '',
  ].join('\n');

  const destino = `docs/reporte-fotos-empaques-odoo-${fecha}.md`;
  writeFileSync(destino, md);
  console.log(`\nReporte escrito en ${destino}`);
  console.log('\nCRÍTICOS (< 512 px):');
  for (const f of criticos) console.log(`- [${f.id}] ${f.ref || 'sin ref'} | ${f.nombre} | ${f.width}×${f.height} ${f.formato}${f.editorial ? ' | tiene editorial' : ''}`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
