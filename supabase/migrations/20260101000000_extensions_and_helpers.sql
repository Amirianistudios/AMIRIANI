-- AMIRIANI storefront — extensions, enums and shared helper functions.
-- Applied first; every later migration depends on the types defined here.

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type product_status      as enum ('draft', 'active', 'archived');
create type collection_status   as enum ('draft', 'active', 'archived');
create type order_status        as enum ('pending', 'open', 'cancelled', 'archived');
create type payment_status      as enum ('unpaid', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed');
create type fulfilment_status   as enum ('unfulfilled', 'partially_fulfilled', 'fulfilled', 'delivered', 'cancelled');
create type discount_kind       as enum ('percentage', 'fixed_amount', 'free_shipping');
create type inventory_reason    as enum ('import', 'manual', 'sale', 'restock', 'cancellation', 'reservation', 'release', 'correction');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Keeps updated_at honest without trusting the client.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- unaccent is not available on every Supabase tier; fall back to a manual map
-- so slugify never breaks the importer. Defined before slugify, which calls it:
-- Postgres validates SQL function bodies at creation time.
create or replace function unaccent_fallback(value text)
returns text
language sql
immutable
as $$
  select translate(
    value,
    'àáâãäåāăąçćčđďèéêëēĕėęěìíîïĩīĭįıñńňòóôõöøōŏőùúûüũūŭůűųýÿŷžźżšśŝßæœ',
    'aaaaaaaaacccddeeeeeeeeeiiiiiiiiinnnooooooooouuuuuuuuuuyyyzzzsssbao'
  );
$$;

-- URL-safe slug generator used by the importer and admin.
create or replace function slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(unaccent_fallback(value)), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- NOTE: is_admin() is defined in 20260101000200_customers_carts.sql, directly
-- after the admin_users table it reads. It cannot live here because its body
-- is validated when the function is created.
