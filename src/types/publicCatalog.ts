export interface PublicCatalogProduct {
  id: number;
  name: string;
  description_sale: string | false;
  categ_id: [number, string] | false;
  image_128: string | false;
  default_code: string | false;
  uom_name: string;
}

export interface PublicCatalogCategoryNode {
  id: number;
  name: string;
  complete_name: string;
  slug: string;
  parentId: number | null;
  level: number;
  children: PublicCatalogCategoryNode[];
}

export interface PublicProductDetail {
  id: number;
  name: string;
  description_sale: string | false;
  categ_id: [number, string] | false;
  image_128: string | false;
  image_1920: string | false;
  default_code: string | false;
  uom_name: string;
  product_variant_count: number;
  attribute_line_ids: number[];
}

export interface PublicCatalogQueryState {
  search: string;
  categoryId: number | null;
  page: number;
  limit: number;
}

export interface PublicCatalogListingResult {
  query: PublicCatalogQueryState;
  productos: PublicCatalogProduct[];
  total: number;
  totalPages: number;
  selectedCategory: PublicCatalogCategoryNode | null;
  searchTooShort: boolean;
  minSearchLength: number;
}

export interface PublicCatalogPageData extends PublicCatalogListingResult {
  categories: PublicCatalogCategoryNode[];
}
