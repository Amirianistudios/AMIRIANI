-- Row Level Security.
--
-- Principles:
--   * Every table has RLS enabled. Nothing is readable by default.
--   * The public (anon) role may read only published catalogue content.
--   * Customers may read and write only their own rows.
--   * Carts are addressed by an unguessable token held in an httpOnly cookie
--     and are therefore driven from the server with the service role; the
--     browser gets no direct cart access.
--   * Orders are never writable from the browser. They are created by the
--     checkout route and mutated by the Stripe webhook, both service-role.
--   * Admin access is gated on is_admin(), which reads admin_users.

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- Supabase grants these to the API roles by default for tables created by the
-- `postgres` role, but stating them explicitly means this repository fully
-- reproduces the database on any Postgres, and makes the intent auditable:
-- the API roles can reach the tables, and RLS below decides which rows.
--
-- Note there is no blanket INSERT/UPDATE/DELETE grant to anon: the write paths
-- anon needs (newsletter) are granted individually.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to anon;

grant insert on newsletter_subscribers to anon;

alter table products              enable row level security;
alter table product_variants      enable row level security;
alter table product_images        enable row level security;
alter table collections           enable row level security;
alter table collection_products   enable row level security;
alter table admin_users           enable row level security;
alter table customers             enable row level security;
alter table customer_addresses    enable row level security;
alter table carts                 enable row level security;
alter table cart_items            enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table inventory_movements   enable row level security;
alter table discount_codes        enable row level security;
alter table newsletter_subscribers enable row level security;
alter table site_settings         enable row level security;
alter table navigation_items      enable row level security;
alter table content_pages         enable row level security;
alter table homepage_sections     enable row level security;
alter table redirects             enable row level security;

-- ---------------------------------------------------------------------------
-- Catalogue — public read of active content, admin write
-- ---------------------------------------------------------------------------

create policy products_public_read on products
  for select to anon, authenticated
  using (status = 'active');

create policy products_admin_all on products
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy variants_public_read on product_variants
  for select to anon, authenticated
  using (
    active and exists (
      select 1 from products p
      where p.id = product_id and p.status = 'active'
    )
  );

create policy variants_admin_all on product_variants
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy product_images_public_read on product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from products p
      where p.id = product_id and p.status = 'active'
    )
  );

create policy product_images_admin_all on product_images
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy collections_public_read on collections
  for select to anon, authenticated
  using (status = 'active');

create policy collections_admin_all on collections
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy collection_products_public_read on collection_products
  for select to anon, authenticated
  using (
    exists (select 1 from collections c where c.id = collection_id and c.status = 'active')
    and exists (select 1 from products p where p.id = product_id and p.status = 'active')
  );

create policy collection_products_admin_all on collection_products
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Site content — public read, admin write
-- ---------------------------------------------------------------------------

create policy content_pages_public_read on content_pages
  for select to anon, authenticated using (published);

create policy content_pages_admin_all on content_pages
  for all to authenticated using (is_admin()) with check (is_admin());

create policy navigation_public_read on navigation_items
  for select to anon, authenticated using (true);

create policy navigation_admin_all on navigation_items
  for all to authenticated using (is_admin()) with check (is_admin());

create policy homepage_sections_public_read on homepage_sections
  for select to anon, authenticated using (enabled);

create policy homepage_sections_admin_all on homepage_sections
  for all to authenticated using (is_admin()) with check (is_admin());

create policy site_settings_public_read on site_settings
  for select to anon, authenticated using (true);

create policy site_settings_admin_all on site_settings
  for all to authenticated using (is_admin()) with check (is_admin());

create policy redirects_public_read on redirects
  for select to anon, authenticated using (true);

create policy redirects_admin_all on redirects
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Admin users — a user may see their own admin row; only the service role
-- (or an existing admin) may grant admin.
-- ---------------------------------------------------------------------------

create policy admin_users_self_read on admin_users
  for select to authenticated using (user_id = auth.uid());

create policy admin_users_admin_all on admin_users
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Customers — own row only
-- ---------------------------------------------------------------------------

create policy customers_self_read on customers
  for select to authenticated using (user_id = auth.uid());

create policy customers_self_update on customers
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy customers_admin_all on customers
  for all to authenticated using (is_admin()) with check (is_admin());

create policy addresses_self_all on customer_addresses
  for all to authenticated
  using (
    exists (select 1 from customers c
            where c.id = customer_id and c.user_id = auth.uid())
  )
  with check (
    exists (select 1 from customers c
            where c.id = customer_id and c.user_id = auth.uid())
  );

create policy addresses_admin_all on customer_addresses
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Carts — signed-in customers may read their own; anonymous carts are
-- server-only (service role bypasses RLS).
-- ---------------------------------------------------------------------------

create policy carts_self_read on carts
  for select to authenticated
  using (
    customer_id is not null
    and exists (select 1 from customers c
                where c.id = customer_id and c.user_id = auth.uid())
  );

create policy carts_admin_all on carts
  for all to authenticated using (is_admin()) with check (is_admin());

create policy cart_items_self_read on cart_items
  for select to authenticated
  using (
    exists (
      select 1 from carts ct
      join customers c on c.id = ct.customer_id
      where ct.id = cart_id and c.user_id = auth.uid()
    )
  );

create policy cart_items_admin_all on cart_items
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Orders — read-only for the owning customer, never client-writable
-- ---------------------------------------------------------------------------

create policy orders_self_read on orders
  for select to authenticated
  using (
    customer_id is not null
    and exists (select 1 from customers c
                where c.id = customer_id and c.user_id = auth.uid())
  );

create policy orders_admin_all on orders
  for all to authenticated using (is_admin()) with check (is_admin());

create policy order_items_self_read on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      join customers c on c.id = o.customer_id
      where o.id = order_id and c.user_id = auth.uid()
    )
  );

create policy order_items_admin_all on order_items
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Inventory and discounts — admin only. Discount validation happens
-- server-side, so the browser never needs to read codes.
-- ---------------------------------------------------------------------------

create policy inventory_movements_admin_all on inventory_movements
  for all to authenticated using (is_admin()) with check (is_admin());

create policy discount_codes_admin_all on discount_codes
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Newsletter — anyone may subscribe; only admins may read the list.
-- ---------------------------------------------------------------------------

create policy newsletter_insert on newsletter_subscribers
  for insert to anon, authenticated with check (true);

create policy newsletter_admin_all on newsletter_subscribers
  for all to authenticated using (is_admin()) with check (is_admin());
