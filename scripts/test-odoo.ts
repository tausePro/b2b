/**
 * Script de test de conexión con Odoo 16 (solo lectura)
 * Ejecutar: npx tsx scripts/test-odoo.ts
 */

// Cargar variables de entorno
import { config } from 'dotenv';
config({ path: '.env.local' });

import {
  getServerVersion,
  authenticate,
  searchRead,
  searchCount,
  testConnection,
} from '../src/lib/odoo/client';

async function main() {
  console.log('='.repeat(60));
  console.log('  TEST DE CONEXIÓN ODOO 16 - IMPRIMA B2B');
  console.log('='.repeat(60));
  console.log(`  URL: ${process.env.ODOO_URL}`);
  console.log(`  DB:  ${process.env.ODOO_DB}`);
  console.log(`  User: ${process.env.ODOO_USERNAME}`);
  console.log('='.repeat(60));
  console.log('');

  const result = await testConnection();

  if (!result.success) {
    console.error('❌ CONEXIÓN FALLIDA:', result.error);
    process.exit(1);
  }

  console.log('✅ Conexión exitosa!');
  console.log('');

  // Versión
  const ver = result.version as Record<string, unknown>;
  console.log(`📦 Servidor: Odoo ${ver?.server_version || 'desconocido'}`);
  console.log(`🔑 UID autenticado: ${result.uid}`);
  console.log('');

  // Partners
  console.log(`👥 Partners (clientes): ${result.partners_count} total`);
  if (result.sample_partners && result.sample_partners.length > 0) {
    console.log('   Muestra:');
    for (const p of result.sample_partners) {
      console.log(`   - [${p.id}] ${p.name} | ${p.email || 'sin email'} | NIT: ${p.vat || 'N/A'}`);
    }
  }
  console.log('');

  // Productos
  console.log(`📦 Productos (vendibles): ${result.products_count} total`);
  if (result.sample_products && result.sample_products.length > 0) {
    console.log('   Muestra:');
    for (const p of result.sample_products) {
      console.log(`   - [${p.id}] ${p.name} | Ref: ${p.default_code || 'N/A'} | $${p.list_price}`);
    }
  }
  console.log('');

  // Pedidos
  console.log(`🛒 Pedidos de venta: ${result.sale_orders_count} total`);
  if (result.sample_orders && result.sample_orders.length > 0) {
    console.log('   Últimos pedidos:');
    for (const o of result.sample_orders) {
      const partner = o.partner_id as [number, string];
      console.log(`   - [${o.name}] ${partner?.[1] || 'N/A'} | ${o.state} | $${o.amount_total} | ${o.date_order}`);
    }
  }
  console.log('');

  // Explorar modelos adicionales relevantes para Imprima
  console.log('-'.repeat(60));
  console.log('  DATOS ADICIONALES RELEVANTES');
  console.log('-'.repeat(60));

  try {
    // Categorías de producto
    const categories = await searchRead(
      'product.category',
      [],
      ['id', 'name', 'parent_id', 'complete_name'],
      { limit: 20, order: 'complete_name asc' }
    );
    console.log(`\n📂 Categorías de producto: ${categories.length}`);
    for (const c of categories) {
      console.log(`   - [${c.id}] ${c.complete_name || c.name}`);
    }
  } catch (e) {
    console.log('   ⚠️ No se pudieron leer categorías:', (e as Error).message);
  }

  try {
    // Listas de precios
    const pricelists = await searchRead(
      'product.pricelist',
      [],
      ['id', 'name', 'currency_id', 'active'],
      { limit: 10 }
    );
    console.log(`\n💰 Listas de precios: ${pricelists.length}`);
    for (const pl of pricelists) {
      const currency = pl.currency_id as [number, string];
      console.log(`   - [${pl.id}] ${pl.name} | ${currency?.[1] || 'N/A'} | ${pl.active ? 'Activa' : 'Inactiva'}`);
    }
  } catch (e) {
    console.log('   ⚠️ No se pudieron leer listas de precios:', (e as Error).message);
  }

  try {
    // Direcciones de envío (res.partner con type = 'delivery')
    const deliveryAddresses = await searchCount('res.partner', [
      ['type', '=', 'delivery'],
    ]);
    console.log(`\n📍 Direcciones de envío: ${deliveryAddresses}`);
  } catch (e) {
    console.log('   ⚠️ No se pudieron contar direcciones:', (e as Error).message);
  }

  try {
    // Almacenes
    const warehouses = await searchRead(
      'stock.warehouse',
      [],
      ['id', 'name', 'code'],
      { limit: 10 }
    );
    console.log(`\n🏭 Almacenes: ${warehouses.length}`);
    for (const w of warehouses) {
      console.log(`   - [${w.id}] ${w.name} (${w.code})`);
    }
  } catch (e) {
    console.log('   ⚠️ No se pudieron leer almacenes:', (e as Error).message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('  TEST COMPLETADO EXITOSAMENTE');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
