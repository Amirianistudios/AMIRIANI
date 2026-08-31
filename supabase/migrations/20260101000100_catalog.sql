-- Catalog: products, variants, images, collections, and the many-to-many join.
-- Money is stored in minor units (cents) as integers — never floats.

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

create table products (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null,
  title               text not null,
  description_html    text,
  short_description   text,
  status              product_status not null default 'draft',
  vendor              text,
  product_type        text,
  category            text,
  sku                 text,
  barcode             text,
  -- Denormalised "from" price for listing pages; kept in sync with variants by
  -- a trigger so collection queries never need to aggregate variants.
  base_price_cents    integer check (base_price_cents >= 0),
  compare_at_cents    integer check (compare_at_cents >= 0),
  cost_cents          integer check (cost_cents >= 0),
  currency            text not null default 'EUR' check (char_length(currency) = 3),
  taxable             boolean not null default true,
  tax_included        boolean not null default true,
  featured            boolean not null default false,
  position            integer not null default 0,
  tags                text[] not null default '{}',
  seo_title           text,
  seo_description     text,
  -- Provenance of a migrated record, so a re-import updates rather than duplicates.
  external_source     text,
  external_id         text,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint products_slug_key unique (slug),
  constraint products_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint products_compare_gt_price check (
    compare_at_cents is null
    or base_price_cents is null
    or compare_at_cents >= base_price_cents
  ),
  constraint products_external_key unique (external_source, external_id)
);

create index products_status_idx        on products (status) where status = 'active';
create index products_featured_idx      on products (featured) where featured;
create index products_created_at_idx    on products (created_at desc);
create index products_title_trgm_idx    on products using gin (title gin_trgm_ops);
create index products_tags_idx          on products using gin (tags);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Variants
-- ---------------------------------------------------------------------------

create table product_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products (id) on delete cascade,
  title               text not null,
  sku                 text,
  barcode             text,
  size                text,
  color               text,
  material            text,
  price_cents         integer not null check (price_cents >= 0),
  compare_at_cents    integer check (compare_at_cents >= 0),
  cost_cents          integer check (cost_cents >= 0),
  weight_grams        integer check (weight_grams >= 0),
  position            integer not null default 0,
  active              boolean not null default true,
  -- Inventory lives here as the authoritative count; movements are journalled
  -- in inventory_movements. Never allowed to go negative.
  inventory_quantity  integer not null default 0 check (inventory_quantity >= 0),
  inventory_reserved  integer not null default 0 check (inventory_reserved >= 0),
  inventory_tracked   boolean not null default true,
  allow_backorder     boolean not null default false,
  external_source     text,
  external_id         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint variants_sku_key unique (sku),
  constraint variants_external_key unique (external_source, external_id),
  constraint variants_compare_gt_price check (
    compare_at_cents is null or compare_at_cents >= price_cents
  ),
  constraint variants_reserved_lte_qty check (inventory_reserved <= inventory_quantity)
);

create index variants_product_idx on product_variants (product_id, position);
create unique index variants_product_title_key on product_variants (product_id, title);

create trigger variants_set_updated_at
  before update on product_variants
  for each row execute function set_updated_at();

-- Keep products.base_price_cents equal to the cheapest active variant.
create or replace function sync_product_base_price()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.product_id, old.product_id);
begin
  update products p
  set base_price_cents = sub.min_price,
      compare_at_cents = sub.max_compare
  from (
    select min(price_cents) as min_price,
           max(compare_at_cents) as max_compare
    from product_variants
    where product_id = target and active
  ) sub
  where p.id = target;
  return null;
end;
$$;

create trigger variants_sync_product_price
  after insert or update of price_cents, compare_at_cents, active or delete
  on product_variants
  for each row execute function sync_product_base_price();

-- ---------------------------------------------------------------------------
-- Product images
-- ---------------------------------------------------------------------------

create table product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products (id) on delete cascade,
  variant_id    uuid references product_variants (id) on delete set null,
  -- Path within the Supabase Storage bucket, e.g. products/<id>/01-front.jpg.
  storage_path  text,
  -- Absolute URL, used when an asset has not been migrated into Storage yet.
  external_url  text,
  alt           text,
  width         integer check (width > 0),
  height        integer check (height > 0),
  position      integer not null default 0,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),

  constraint product_images_has_source check (
    storage_path is not null or external_url is not null
  )
);

create index product_images_product_idx on product_images (product_id, position);
-- At most one primary image per product.
create unique index product_images_primary_key
  on product_images (product_id) where is_primary;

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------

create table collections (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null,
  title             text not null,
  description_html  text,
  image_path        text,
  image_url         text,
  status            collection_status not null default 'active',
  position          integer not null default 0,
  sort_order        text not null default 'title_asc',
  seo_title         text,
  seo_description   text,
  external_source   text,
  external_id       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint collections_slug_key unique (slug),
  constraint collections_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint collections_external_key unique (external_source, external_id),
  constraint collections_sort_order_valid check (
    sort_order in ('manual', 'title_asc', 'title_desc', 'price_asc',
                   'price_desc', 'created_desc', 'created_asc')
  )
);

create trigger collections_set_updated_at
  before update on collections
  for each row execute function set_updated_at();

create table collection_products (
  collection_id uuid not null references collections (id) on delete cascade,
  product_id    uuid not null references products (id) on delete cascade,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (collection_id, product_id)
);

create index collection_products_product_idx on collection_products (product_id);
create index collection_products_position_idx on collection_products (collection_id, position);
