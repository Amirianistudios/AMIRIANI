-- Assertions run against a freshly migrated database by scripts/verify-db.sh.
-- Every check raises on failure, so the script exits non-zero if the schema
-- does not behave as the application expects.

\set ON_ERROR_STOP on

do $$
declare
  v_missing text;
begin
  -- ------------------------------------------------------------------ RLS
  -- Every application table must have RLS enabled. A table added later
  -- without a policy would silently be world-readable, so fail loudly.
  select string_agg(c.relname, ', ')
    into v_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if v_missing is not null then
    raise exception 'Tables without RLS enabled: %', v_missing;
  end if;

  raise notice 'RLS enabled on every public table';
end
$$;

do $$
declare
  v_product uuid;
  v_variant uuid;
  v_qty integer;
begin
  -- ------------------------------------------------------- inventory safety
  insert into products (slug, title, status, currency)
  values ('test-product', 'Test Product', 'active', 'EUR')
  returning id into v_product;

  insert into product_variants (product_id, title, price_cents, inventory_quantity)
  values (v_product, 'M', 1000, 3)
  returning id into v_variant;

  -- The trigger must have back-filled the product's "from" price.
  if (select base_price_cents from products where id = v_product) <> 1000 then
    raise exception 'base_price_cents was not synced from the variant';
  end if;

  -- A legal decrement succeeds.
  v_qty := adjust_inventory(v_variant, -2, 'sale');
  if v_qty <> 1 then
    raise exception 'expected 1 remaining after selling 2 of 3, got %', v_qty;
  end if;

  -- Overselling a tracked variant must be rejected, not clamped.
  begin
    perform adjust_inventory(v_variant, -5, 'sale');
    raise exception 'overselling was allowed — inventory guard is broken';
  exception
    when others then
      if sqlerrm not like '%insufficient_inventory%' then
        raise;
      end if;
  end;

  -- The journal must record both the successful movement and nothing more.
  if (select count(*) from inventory_movements where variant_id = v_variant) <> 1 then
    raise exception 'inventory journal did not record exactly one movement';
  end if;

  raise notice 'Inventory guard rejects overselling and journals movements';
end
$$;

do $$
declare
  v_cart uuid;
  v_token text;
  v_variant uuid;
  v_order orders;
begin
  -- --------------------------------------------------- checkout transaction
  select id into v_variant from product_variants limit 1;
  update product_variants set inventory_quantity = 5 where id = v_variant;

  insert into carts default values returning id, token into v_cart, v_token;
  insert into cart_items (cart_id, variant_id, quantity) values (v_cart, v_variant, 2);

  v_order := create_order_from_cart(
    p_cart_id          => v_cart,
    p_email            => 'buyer@example.com',
    p_shipping_address => '{"address1":"1 Test St","city":"Brussels","postcode":"1000","country_code":"BE"}'::jsonb,
    p_billing_address  => null,
    p_shipping_cents   => 495,
    p_idempotency_key  => 'test-key-1'
  );

  -- Totals are computed server-side from database prices.
  if v_order.subtotal_cents <> 2000 then
    raise exception 'expected subtotal 2000, got %', v_order.subtotal_cents;
  end if;
  if v_order.total_cents <> 2495 then
    raise exception 'expected total 2495, got %', v_order.total_cents;
  end if;

  -- Stock was decremented by the order.
  if (select inventory_quantity from product_variants where id = v_variant) <> 3 then
    raise exception 'checkout did not decrement inventory';
  end if;

  -- The line carries a frozen snapshot, not just a foreign key.
  if not exists (
    select 1 from order_items
    where order_id = v_order.id
      and product_title is not null
      and unit_price_cents = 1000
      and snapshot ? 'captured_at'
  ) then
    raise exception 'order item snapshot was not written';
  end if;

  -- Replaying the same idempotency key must return the original order, not a
  -- second one — this is what stops a double-submit becoming a double charge.
  if (
    create_order_from_cart(
      p_cart_id          => v_cart,
      p_email            => 'buyer@example.com',
      p_shipping_address => '{"address1":"1 Test St","city":"Brussels","postcode":"1000","country_code":"BE"}'::jsonb,
      p_billing_address  => null,
      p_shipping_cents   => 495,
      p_idempotency_key  => 'test-key-1'
    )
  ).id <> v_order.id then
    raise exception 'idempotency key did not de-duplicate the order';
  end if;

  if (select count(*) from orders) <> 1 then
    raise exception 'a duplicate order was created';
  end if;

  -- The cart is closed and cannot be checked out again.
  if (select completed_at from carts where id = v_cart) is null then
    raise exception 'cart was not marked completed';
  end if;

  -- Restocking returns the units and is idempotent.
  perform restock_order(v_order.id);
  if (select inventory_quantity from product_variants where id = v_variant) <> 5 then
    raise exception 'restock did not return the units';
  end if;
  perform restock_order(v_order.id);
  if (select inventory_quantity from product_variants where id = v_variant) <> 5 then
    raise exception 'restock ran twice — it must be idempotent';
  end if;

  raise notice 'Checkout prices server-side, is idempotent, and restocks safely';
end
$$;

do $$
begin
  -- ------------------------------------------------------------ constraints
  -- An order whose totals do not add up must be impossible to store.
  begin
    insert into orders (email, subtotal_cents, discount_cents, shipping_cents,
                        tax_cents, total_cents)
    values ('x@example.com', 1000, 0, 0, 0, 9999);
    raise exception 'orders_total_consistent did not fire';
  exception
    when check_violation then null;
  end;

  -- compare-at below the selling price would render a nonsensical "sale".
  begin
    insert into product_variants (product_id, title, price_cents, compare_at_cents)
    values ((select id from products limit 1), 'BAD', 2000, 1000);
    raise exception 'variants_compare_gt_price did not fire';
  exception
    when check_violation then null;
  end;

  -- Slugs must stay URL-safe.
  begin
    insert into products (slug, title) values ('Not A Slug!', 'x');
    raise exception 'products_slug_format did not fire';
  exception
    when check_violation then null;
  end;

  raise notice 'Check constraints reject inconsistent money and malformed slugs';
end
$$;

do $$
declare
  v_count integer;
begin
  -- ------------------------------------------------------------ RLS in force
  -- As an anonymous visitor, a draft product must be invisible.
  insert into products (slug, title, status) values ('hidden-draft', 'Hidden', 'draft');

  set local role anon;
  select count(*) into v_count from products where slug = 'hidden-draft';
  reset role;

  if v_count <> 0 then
    raise exception 'anon can read draft products — catalogue RLS is broken';
  end if;

  -- Orders must be entirely invisible to anon.
  set local role anon;
  select count(*) into v_count from orders;
  reset role;

  if v_count <> 0 then
    raise exception 'anon can read orders — order RLS is broken';
  end if;

  raise notice 'Anonymous role cannot read drafts or orders';
end
$$;
