import { NextResponse, NextRequest } from 'next/server';
import {
  authenticate,
  getEtiquetasCliente,
  getProductos,
  getProductosByPricelist,
  getEtiquetasProducto,
  read,
} from '@/lib/odoo/client';
import { getServerOdooConfig } from '@/lib/odoo/serverConfig';
import { authorizeApiRoles, getAccessibleOdooPartnerIds } from '@/lib/auth/apiRouteGuards';

const AUTHENTICATED_PRODUCT_ROLES = ['super_admin', 'direccion', 'asesor', 'comprador', 'aprobador'] as const;
const AUTHENTICATED_MAX_LIMIT = 500;
const PUBLIC_MAX_LIMIT = 50;

function normalizeLimit(rawValue: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(rawValue || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeOffset(rawValue: string | null) {
  const parsed = Number.parseInt(rawValue || '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const config = await getServerOdooConfig();
    if (!config) {
      return NextResponse.json(
        { error: 'Configuración de Odoo no encontrada' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get('partner_id');
    const pricelistIdParam = searchParams.get('pricelist_id');
    const tagIds = searchParams.get('tag_ids');
    const categIds = searchParams.get('categ_ids');
    const search = searchParams.get('search')?.trim() || '';
    const includeTagNames = searchParams.get('include_tag_names') === 'true';
    const parsedPartnerId = partnerId ? parseInt(partnerId, 10) : null;
    const parsedPricelistId = pricelistIdParam ? parseInt(pricelistIdParam, 10) : null;
    const parsedCategIds = (categIds || '')
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter(Boolean);
    const publicCatalogRequest =
      !parsedPartnerId &&
      !parsedPricelistId &&
      !tagIds &&
      parsedCategIds.length === 0 &&
      !includeTagNames &&
      search.length >= 3;

    if (partnerId && (!parsedPartnerId || Number.isNaN(parsedPartnerId))) {
      return NextResponse.json(
        { error: 'partner_id inválido' },
        { status: 400 }
      );
    }

    if (!publicCatalogRequest) {
      const authorized = await authorizeApiRoles(AUTHENTICATED_PRODUCT_ROLES);
      if (authorized instanceof NextResponse) {
        return authorized;
      }

      const actorRole = authorized.actor.rol as (typeof AUTHENTICATED_PRODUCT_ROLES)[number];

      if (!parsedPartnerId && (actorRole === 'comprador' || actorRole === 'aprobador')) {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            details: 'Debes consultar el catálogo con el partner asociado a tu empresa.',
          },
          { status: 403 }
        );
      }

      if (parsedPartnerId) {
        const accessiblePartnerIds = await getAccessibleOdooPartnerIds(authorized);
        if (!accessiblePartnerIds.has(parsedPartnerId)) {
          return NextResponse.json(
            {
              error: 'FORBIDDEN',
              details: 'No tienes acceso al partner Odoo solicitado.',
            },
            { status: 403 }
          );
        }
      }
    }

    const limit = normalizeLimit(
      searchParams.get('limit'),
      publicCatalogRequest ? PUBLIC_MAX_LIMIT : 200,
      publicCatalogRequest ? PUBLIC_MAX_LIMIT : AUTHENTICATED_MAX_LIMIT
    );
    const offset = publicCatalogRequest ? 0 : normalizeOffset(searchParams.get('offset'));

    const session = await authenticate(config);

    let productos;
    let partnerContext: {
      id: number;
      name: string;
      tag_ids: number[];
      partner_tags: Array<{ id: number; name: string; color: number }>;
      pricelist: { id: number; name: string } | null;
    } | null = null;

    if (parsedPartnerId) {
      const [partnerRows, etiquetasCliente] = await Promise.all([
        read(
          'res.partner',
          [parsedPartnerId],
          ['id', 'name', 'category_id', 'property_product_pricelist'],
          session
        ),
        getEtiquetasCliente(session),
      ]);

      const partner = partnerRows[0];
      if (partner) {
        const partnerTagIds = Array.isArray(partner.category_id) ? (partner.category_id as number[]) : [];
        const pricelistValue = Array.isArray(partner.property_product_pricelist)
          ? (partner.property_product_pricelist as [number, string])
          : false;
        const etiquetasClienteMap = new Map(etiquetasCliente.map((tag) => [tag.id, tag]));

        partnerContext = {
          id: typeof partner.id === 'number' ? partner.id : parsedPartnerId,
          name: typeof partner.name === 'string' ? partner.name : `Partner ${parsedPartnerId}`,
          tag_ids: partnerTagIds,
          partner_tags: partnerTagIds.map((tagId) => {
            const tag = etiquetasClienteMap.get(tagId);
            return {
              id: tagId,
              name: tag?.name || `Etiqueta ${tagId}`,
              color: tag?.color || 0,
            };
          }),
          pricelist: pricelistValue
            ? {
                id: pricelistValue[0],
                name: pricelistValue[1],
              }
            : null,
        };
      }
    }

    // Pricelist efectiva: 1) override manual (query param), 2) pricelist del partner en Odoo
    const effectivePricelistId = parsedPricelistId ?? partnerContext?.pricelist?.id ?? null;

    if (parsedPartnerId) {
      // Prioridad: 1) Lista de precios (override o Odoo), 2) Etiquetas del partner, 3) Catálogo general
      if (effectivePricelistId) {
        productos = await getProductosByPricelist(session, effectivePricelistId, {
          limit,
          offset,
          categIds: parsedCategIds,
          search,
        });
      } else {
        const partnerTagIds = partnerContext?.tag_ids ?? [];
        if (partnerTagIds.length > 0) {
          productos = await getProductos(session, {
            tagIds: partnerTagIds,
            limit,
            offset,
            categIds: parsedCategIds,
            search,
          });
        } else {
          productos = await getProductos(session, {
            limit,
            offset,
            categIds: parsedCategIds,
            search,
          });
        }
      }
    } else if (parsedPricelistId) {
      productos = await getProductosByPricelist(session, parsedPricelistId, {
        limit,
        offset,
        categIds: parsedCategIds,
        search,
      });
    } else if (tagIds) {
      const ids = tagIds.split(',').map((id) => parseInt(id.trim(), 10)).filter(Boolean);
      productos = await getProductos(session, { tagIds: ids, categIds: parsedCategIds, limit, offset, search });
    } else {
      productos = await getProductos(session, { categIds: parsedCategIds, limit, offset, search });
    }

    if (includeTagNames) {
      const etiquetas = await getEtiquetasProducto(session);
      const etiquetasMap = new Map(etiquetas.map((tag) => [tag.id, tag.name]));
      const productosConEtiquetas = productos.map((producto) => ({
        ...producto,
        product_tags: (producto.product_tag_ids || []).map((tagId) => [tagId, etiquetasMap.get(tagId) || `Etiqueta ${tagId}`]),
      }));

      return NextResponse.json({
        productos: productosConEtiquetas,
        total: productosConEtiquetas.length,
        partner_context: partnerContext,
        etiquetas_producto: etiquetas,
      });
    }

    return NextResponse.json({ productos, total: productos.length, partner_context: partnerContext });
  } catch (err) {
    console.error('[API /odoo/productos]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    );
  }
}
