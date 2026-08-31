-- Orders, order items with permanent product snapshots, inventory journal,
-- discounts, newsletter, site settings and navigation.

-- ---------------------------------------------------------------------------
-- Discounts
-- ---------------------------------------------------------------------------

create table discount_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                citext not null,
  kind                discount_kind not null,
  -- Percentage: 1–100. Fixed amount: minor units. Free shipping: ignored.
  value               numeric(10, 2) not null check (value >= 0),
  minimum_subtotal_cents integer not null default 0 check (minimum_subtotal_cents >= 0),
  usage_limit         integer check (usage_limit > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer > 0),
  times_used          integer not null default 0 check (times_used >= 0),
  starts_at           timestamptz not null default now(),
  ends_at             timestamptz,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint discount_codes_code_key unique (code),
  constraint discount_codes_percentage_range check (
    kind <> 'percentage' or (value > 0 and value <= 100)
  ),
  constraint discount_codes_window check (ends_at is null or ends_at > starts_at)
);

create trigger discount_codes_set_updated_at
  before update on discount_codes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

create sequence order_number_seq start 1001;

create table orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null default ('AM-' || nextval('order_number_seq')::text),
  customer_id         uuid references customers (id) on delete set null,
  email               citext not null,
  phone               text,
  status              order_status not null default 'pending',
  payment_status      payment_status not null default 'unpaid',
  fulfilment_status   fulfilment_status not null default 'unfulfilled',
  currency            text not null default 'EUR' check (char_length(currency) = 3),

  -- All money in minor units, computed server-side at checkout.
  subtotal_cents      integer not null default 0 check (subtotal_cents >= 0),
  discount_cents      integer not null default 0 check (discount_cents >= 0),
  shipping_cents      integer not null default 0 check (shipping_cents >= 0),
  tax_cents           integer not null default 0 check (tax_cents >= 0),
  total_cents         integer not null default 0 check (total_cents >= 0),

  discount_code       text,
  shipping_address    jsonb,
  billing_address     jsonb,
  note                text,

  -- Stripe references. The session id is unique so a replayed webhook or a
  -- double submit can never create a second order for one payment.
  stripe_session_id       text,
  stripe_payment_intent   text,
  -- Idempotency key supplied by the checkout route.
  idempotency_key     text,

  placed_at           timestamptz,
  paid_at             timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_number_key unique (order_number),
  constraint orders_stripe_session_key unique (stripe_session_id),
  constraint orders_stripe_intent_key unique (stripe_payment_intent),
  constraint orders_idempotency_key unique (idempotency_key),
  constraint orders_total_consistent check (
    total_cents = subtotal_cents - discount_cents + shipping_cents + tax_cents
  )
);

create index orders_customer_idx on orders (customer_id, created_at desc);
create index orders_email_idx on orders (email);
create index orders_status_idx on orders (status, payment_status);
create index orders_created_idx on orders (created_at desc);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Order items — with a permanent snapshot of the product at purchase time
-- ---------------------------------------------------------------------------

create table order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders (id) on delete cascade,
  -- Nullable on purpose: the catalogue row may be deleted later, but the
  -- historical order must stay intact and readable from the snapshot.
  variant_id          uuid references product_variants (id) on delete set null,
  product_id          uuid references products (id) on delete set null,

  -- Frozen snapshot. Never join to products to render a historical order.
  product_title       text not null,
  variant_title       text not null,
  product_slug        text,
  sku                 text,
  image_url           text,
  unit_price_cents    integer not null check (unit_price_cents >= 0),
  quantity            integer not null check (quantity > 0),
  subtotal_cents      integer not null check (subtotal_cents >= 0),
  snapshot            jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now(),

  constraint order_items_subtotal_consistent check (
    subtotal_cents = unit_price_cents * quantity
  )
);

create index order_items_order_idx on order_items (order_id);
create index order_items_variant_idx on order_items (variant_id);

-- ---------------------------------------------------------------------------
-- Inventory journal
-- ---------------------------------------------------------------------------

create table inventory_movements (
  id           uuid primary key default gen_random_uuid(),
  variant_id   uuid not null references product_variants (id) on delete cascade,
  -- Signed delta applied to product_variants.inventory_quantity.
  delta        integer not null check (delta <> 0),
  reason       inventory_reason not null,
  order_id     uuid references orders (id) on delete set null,
  note         text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index inventory_movements_variant_idx on inventory_movements (variant_id, created_at desc);
create index inventory_movements_order_idx on inventory_movements (order_id);

-- Atomically adjust stock and journal the movement. Raises if the adjustment
-- would take a tracked variant below zero, so overselling is impossible even
-- under concurrent checkouts (the row lock serialises them).
create or replace function adjust_inventory(
  p_variant_id uuid,
  p_delta      integer,
  p_reason     inventory_reason,
  p_order_id   uuid default null,
  p_note       text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracked boolean;
  v_backorder boolean;
  v_new_qty integer;
begin
  if p_delta = 0 then
    raise exception 'adjust_inventory: delta must be non-zero';
  end if;

  select inventory_tracked, allow_backorder, inventory_quantity + p_delta
    into v_tracked, v_backorder, v_new_qty
  from product_variants
  where id = p_variant_id
  for update;

  if not found then
    raise exception 'adjust_inventory: variant % not found', p_variant_id;
  end if;

  if v_tracked and not v_backorder and v_new_qty < 0 then
    raise exception 'insufficient_inventory'
      using detail = format('variant %s would fall to %s', p_variant_id, v_new_qty);
  end if;

  update product_variants
  set inventory_quantity = greatest(v_new_qty, 0)
  where id = p_variant_id;

  insert into inventory_movements (variant_id, delta, reason, order_id, note, created_by)
  values (p_variant_id, p_delta, p_reason, p_order_id, p_note, auth.uid());

  return greatest(v_new_qty, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Newsletter, site settings, navigation, homepage sections, redirects
-- ---------------------------------------------------------------------------

create table newsletter_subscribers (
  id             uuid primary key default gen_random_uuid(),
  email          citext not null,
  source         text not null default 'footer',
  confirmed      boolean not null default false,
  unsubscribed_at timestamptz,
  created_at     timestamptz not null default now(),

  constraint newsletter_email_key unique (email),
  constraint newsletter_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create table site_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create trigger site_settings_set_updated_at
  before update on site_settings
  for each row execute function set_updated_at();

create table navigation_items (
  id          uuid primary key default gen_random_uuid(),
  menu        text not null default 'main',
  label       text not null,
  href        text not null,
  position    integer not null default 0,
  parent_id   uuid references navigation_items (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index navigation_items_menu_idx on navigation_items (menu, position);

create trigger navigation_items_set_updated_at
  before update on navigation_items
  for each row execute function set_updated_at();

-- Editable content pages (about, contact, policies).
create table content_pages (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,
  kind            text not null default 'page' check (kind in ('page', 'policy')),
  title           text not null,
  body_html       text,
  seo_title       text,
  seo_description text,
  published       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint content_pages_slug_kind_key unique (kind, slug)
);

create trigger content_pages_set_updated_at
  before update on content_pages
  for each row execute function set_updated_at();

-- Homepage sections, so the storefront composition is data-driven.
create table homepage_sections (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  position    integer not null default 0,
  enabled     boolean not null default true,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index homepage_sections_position_idx on homepage_sections (position);

create trigger homepage_sections_set_updated_at
  before update on homepage_sections
  for each row execute function set_updated_at();

-- URL redirects, used to preserve SEO when a slug changes.
create table redirects (
  id          uuid primary key default gen_random_uuid(),
  from_path   text not null,
  to_path     text not null,
  permanent   boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint redirects_from_key unique (from_path)
);
