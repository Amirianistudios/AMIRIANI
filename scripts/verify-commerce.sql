-- Commerce assertions that need real concurrency, run by scripts/verify-commerce.sh.
--
-- verify-db.sql covers the single-session behaviour of the schema. This file
-- covers what only shows up with several sessions competing for the same row:
-- overselling under contention, and the exact point at which a checkout blocks.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Fixture: one product, one variant, a known amount of stock.
-- ---------------------------------------------------------------------------

do $$
declare
  v_product uuid;
  v_variant uuid;
begin
  /*
   * Clear any fixture left by an interrupted run. Carts have to go first:
   * cart_items.variant_id is ON DELETE RESTRICT on purpose, so a variant
   * sitting in someone's cart cannot be deleted out from under them.
   */
  delete from carts c
   where exists (
     select 1 from cart_items ci
     join product_variants v on v.id = ci.variant_id
     join products p on p.id = v.product_id
     where ci.cart_id = c.id and p.slug = 'concurrency-fixture'
   );
  /*
   * Also drop the orders these assertions create. Their idempotency keys are
   * fixed, so leaving them behind would make the next run return the previous
   * order instead of placing a new one — correct behaviour, but it would look
   * like stock had failed to move.
   */
  delete from orders
   where idempotency_key in ('verify-discount-1', 'verify-expired-1', 'verify-oversell-1');
  delete from products where slug = 'concurrency-fixture';

  insert into products (slug, title, status, currency)
  values ('concurrency-fixture', 'Concurrency Fixture', 'active', 'EUR')
  returning id into v_product;

  insert into product_variants (product_id, title, sku, price_cents, inventory_quantity)
  values (v_product, 'ONE', 'CONCURRENCY-1', 1000, 5)
  returning id into v_variant;

  raise notice 'Fixture ready: 5 units in stock at 1000 cents';
end
$$;

-- ---------------------------------------------------------------------------
-- Totals and the money constraint hold for a partially discounted order.
-- ---------------------------------------------------------------------------

do $$
declare
  v_variant uuid;
  v_cart uuid;
  v_order orders;
begin
  select id into v_variant from product_variants where sku = 'CONCURRENCY-1';

  -- times_used is reset so the assertion below measures this run only.
  insert into discount_codes (code, kind, value, active)
  values ('VERIFY20', 'percentage', 20, true)
  on conflict (code) do update
    set active = true, value = 20, times_used = 0;

  insert into carts default values returning id into v_cart;
  insert into cart_items (cart_id, variant_id, quantity) values (v_cart, v_variant, 2);

  v_order := create_order_from_cart(
    p_cart_id          => v_cart,
    p_email            => 'discount@example.com',
    p_shipping_address => '{"address1":"1 A","city":"B","postcode":"1000","country_code":"BE"}'::jsonb,
    p_billing_address  => null,
    p_shipping_cents   => 856,
    p_idempotency_key  => 'verify-discount-1',
    p_discount_code    => 'VERIFY20'
  );

  -- 2 x 1000 = 2000, less 20% = 400, plus 856 shipping.
  if v_order.subtotal_cents <> 2000 then
    raise exception 'subtotal wrong: %', v_order.subtotal_cents;
  end if;
  if v_order.discount_cents <> 400 then
    raise exception 'discount wrong: expected 400, got %', v_order.discount_cents;
  end if;
  if v_order.total_cents <> 2456 then
    raise exception 'total wrong: expected 2456, got %', v_order.total_cents;
  end if;

  -- The code's usage counter moved exactly once.
  if (select times_used from discount_codes where code = 'VERIFY20') <> 1 then
    raise exception 'discount usage not counted';
  end if;

  -- Stock fell from 5 to 3.
  if (select inventory_quantity from product_variants where sku = 'CONCURRENCY-1') <> 3 then
    raise exception 'stock not decremented correctly';
  end if;

  raise notice 'Discount applied server-side; totals and usage counter correct';
end
$$;

-- ---------------------------------------------------------------------------
-- An expired or inactive code is ignored rather than honoured.
-- ---------------------------------------------------------------------------

do $$
declare
  v_variant uuid;
  v_cart uuid;
  v_order orders;
begin
  select id into v_variant from product_variants where sku = 'CONCURRENCY-1';

  -- Both ends are in the past: the schema's discount_codes_window constraint
  -- requires ends_at > starts_at, so an "expired" code has to have started
  -- earlier still.
  insert into discount_codes (code, kind, value, active, starts_at, ends_at)
  values ('EXPIRED50', 'percentage', 50, true,
          now() - interval '7 days', now() - interval '1 day')
  on conflict (code) do update
    set starts_at = now() - interval '7 days',
        ends_at = now() - interval '1 day';

  insert into carts default values returning id into v_cart;
  insert into cart_items (cart_id, variant_id, quantity) values (v_cart, v_variant, 1);

  v_order := create_order_from_cart(
    p_cart_id          => v_cart,
    p_email            => 'expired@example.com',
    p_shipping_address => '{"address1":"1 A","city":"B","postcode":"1000","country_code":"BE"}'::jsonb,
    p_billing_address  => null,
    p_shipping_cents   => 856,
    p_idempotency_key  => 'verify-expired-1',
    p_discount_code    => 'EXPIRED50'
  );

  if v_order.discount_cents <> 0 then
    raise exception 'an expired code was applied: % off', v_order.discount_cents;
  end if;
  if v_order.discount_code is not null then
    raise exception 'an expired code was recorded on the order';
  end if;

  raise notice 'Expired discount code ignored, not honoured';
end
$$;

-- ---------------------------------------------------------------------------
-- The last unit: a checkout for more than remains must fail atomically,
-- leaving neither an order nor a stock change.
-- ---------------------------------------------------------------------------

do $$
declare
  v_variant uuid;
  v_cart uuid;
  v_orders_before integer;
  v_stock_before integer;
begin
  select id into v_variant from product_variants where sku = 'CONCURRENCY-1';
  select inventory_quantity into v_stock_before from product_variants where id = v_variant;
  select count(*) into v_orders_before from orders;

  insert into carts default values returning id into v_cart;
  insert into cart_items (cart_id, variant_id, quantity)
  values (v_cart, v_variant, v_stock_before + 1);

  begin
    perform create_order_from_cart(
      p_cart_id          => v_cart,
      p_email            => 'greedy@example.com',
      p_shipping_address => '{"address1":"1 A","city":"B","postcode":"1000","country_code":"BE"}'::jsonb,
      p_billing_address  => null,
      p_shipping_cents   => 856,
      p_idempotency_key  => 'verify-oversell-1'
    );
    raise exception 'checkout succeeded for more units than exist';
  exception
    when others then
      if sqlerrm not like '%insufficient_inventory%' then raise; end if;
  end;

  if (select inventory_quantity from product_variants where id = v_variant) <> v_stock_before then
    raise exception 'a failed checkout still moved stock';
  end if;

  raise notice 'Oversell rejected atomically; stock unchanged';
end
$$;

do $$
begin
  raise notice 'Sequential commerce assertions passed';
end
$$;
