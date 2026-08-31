-- Customers, addresses, carts and cart items.

-- ---------------------------------------------------------------------------
-- Admin users (referenced by is_admin(); deliberately not client-writable)
-- ---------------------------------------------------------------------------

create table admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       citext not null,
  role        text not null default 'admin' check (role in ('admin', 'staff')),
  created_at  timestamptz not null default now()
);

-- Admin check used by RLS policies across the schema. Admin status lives in
-- this private table, never in a JWT claim the browser could influence.
--
-- security definer so it can read admin_users regardless of the caller's own
-- policies, with an explicit search_path so it cannot be hijacked by a
-- shadowing relation on a caller-controlled path.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table customers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,
  email         citext not null,
  first_name    text,
  last_name     text,
  phone         text,
  accepts_marketing boolean not null default false,
  notes         text,
  external_source text,
  external_id     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint customers_email_key unique (email),
  constraint customers_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create index customers_user_idx on customers (user_id);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Addresses
-- ---------------------------------------------------------------------------

create table customer_addresses (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references customers (id) on delete cascade,
  first_name        text,
  last_name         text,
  company           text,
  address1          text not null,
  address2          text,
  city              text not null,
  region            text,
  postcode          text not null,
  country_code      text not null default 'BE' check (char_length(country_code) = 2),
  phone             text,
  default_shipping  boolean not null default false,
  default_billing   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index customer_addresses_customer_idx on customer_addresses (customer_id);
create unique index customer_addresses_default_shipping_key
  on customer_addresses (customer_id) where default_shipping;
create unique index customer_addresses_default_billing_key
  on customer_addresses (customer_id) where default_billing;

create trigger customer_addresses_set_updated_at
  before update on customer_addresses
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Carts
-- ---------------------------------------------------------------------------

create table carts (
  id            uuid primary key default gen_random_uuid(),
  -- Anonymous carts are addressed by this opaque token, stored in an
  -- httpOnly cookie. Signed-in carts also carry customer_id.
  token         text not null default encode(gen_random_bytes(24), 'hex'),
  customer_id   uuid references customers (id) on delete set null,
  currency      text not null default 'EUR' check (char_length(currency) = 3),
  discount_code text,
  note          text,
  -- Set once the cart has been converted, so it is never checked out twice.
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint carts_token_key unique (token)
);

create index carts_customer_idx on carts (customer_id);
create index carts_updated_idx on carts (updated_at desc);

create trigger carts_set_updated_at
  before update on carts
  for each row execute function set_updated_at();

create table cart_items (
  id          uuid primary key default gen_random_uuid(),
  cart_id     uuid not null references carts (id) on delete cascade,
  variant_id  uuid not null references product_variants (id) on delete restrict,
  quantity    integer not null check (quantity > 0 and quantity <= 99),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- One row per variant per cart; adding again bumps the quantity.
  constraint cart_items_unique_variant unique (cart_id, variant_id)
);

create index cart_items_cart_idx on cart_items (cart_id);

create trigger cart_items_set_updated_at
  before update on cart_items
  for each row execute function set_updated_at();

-- Touch the parent cart whenever its contents change, so abandoned-cart
-- cleanup can rely on carts.updated_at.
create or replace function touch_cart()
returns trigger
language plpgsql
as $$
begin
  update carts set updated_at = now()
  where id = coalesce(new.cart_id, old.cart_id);
  return null;
end;
$$;

create trigger cart_items_touch_cart
  after insert or update or delete on cart_items
  for each row execute function touch_cart();
