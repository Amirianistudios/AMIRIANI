-- Harden create_order_from_cart against concurrency.
--
-- Two changes, neither of which alters observable behaviour:
--
--   1. No temporary table. The previous version materialised its lines into a
--      TEMPORARY TABLE, so every checkout ran CREATE TEMP TABLE and touched the
--      system catalogues (pg_class, pg_type, pg_attribute). That is pointless
--      contention on a hot path, and a known source of catalogue bloat under
--      sustained load. Lines are now read straight from the join and the
--      subtotal comes from a single aggregate.
--
--   2. Deterministic lock order. Stock is taken in variant_id order. Without
--      it, two carts containing the same two variants in different orders can
--      each hold one row and wait for the other's — a genuine deadlock that
--      only appears once carts hold more than one item. With a single shared
--      variant the sessions simply queue, which is what makes the oversell
--      guard reliable.
--
-- Note for anyone reading a deadlock report from a test harness: inserting into
-- cart_items takes a KEY SHARE lock on the referenced product_variants row (the
-- foreign key), and holding that while requesting FOR UPDATE on the same row in
-- the *same* transaction deadlocks against any other session doing likewise.
-- The application never does this — the cart API commits the line, and checkout
-- runs later in its own transaction — so a test must commit the cart before
-- checking out, or it measures its own artefact rather than the code.

create or replace function create_order_from_cart(
  p_cart_id          uuid,
  p_email            text,
  p_shipping_address jsonb,
  p_billing_address  jsonb,
  p_shipping_cents   integer,
  p_idempotency_key  text,
  p_customer_id      uuid default null,
  p_discount_code    text default null,
  p_phone            text default null,
  p_note             text default null
)
returns orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order          orders;
  v_item           record;
  v_line_count     integer := 0;
  v_subtotal       integer := 0;
  v_discount       integer := 0;
  v_tax            integer := 0;
  v_total          integer := 0;
  v_currency       text := 'EUR';
  v_discount_row   discount_codes;
  v_existing       orders;
begin
  -- Idempotency: an identical retry returns the original order.
  if p_idempotency_key is not null then
    select * into v_existing from orders where idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  -- Refuse to convert a cart twice.
  perform 1 from carts where id = p_cart_id and completed_at is null for update;
  if not found then
    raise exception 'cart_unavailable' using detail = 'cart missing or already checked out';
  end if;

  if p_shipping_cents is null or p_shipping_cents < 0 then
    raise exception 'invalid_shipping';
  end if;

  -- Price the cart from the database in one pass. Prices sent by a client are
  -- never consulted.
  select
    count(*),
    coalesce(sum(v.price_cents * ci.quantity), 0),
    coalesce(max(p.currency), 'EUR')
  into v_line_count, v_subtotal, v_currency
  from cart_items ci
  join product_variants v on v.id = ci.variant_id
  join products p on p.id = v.product_id
  where ci.cart_id = p_cart_id;

  if v_line_count = 0 then
    raise exception 'cart_empty';
  end if;

  -- Validate the discount code server-side.
  if p_discount_code is not null and length(trim(p_discount_code)) > 0 then
    select * into v_discount_row
    from discount_codes
    where code = p_discount_code
      and active
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (usage_limit is null or times_used < usage_limit)
      and minimum_subtotal_cents <= v_subtotal
    for update;

    if found then
      v_discount := case v_discount_row.kind
        when 'percentage'    then floor(v_subtotal * v_discount_row.value / 100.0)::integer
        when 'fixed_amount'  then least(v_discount_row.value::integer, v_subtotal)
        else 0
      end;
      update discount_codes
      set times_used = times_used + 1
      where id = v_discount_row.id;
    else
      -- Unknown or expired code is simply not applied.
      p_discount_code := null;
    end if;
  else
    p_discount_code := null;
  end if;

  -- Prices on this store are tax-inclusive, so tax is reported as zero and the
  -- displayed price is the price charged. Change here if that ever differs.
  v_tax := 0;
  v_total := v_subtotal - v_discount + p_shipping_cents + v_tax;

  insert into orders (
    customer_id, email, phone, status, payment_status, fulfilment_status,
    currency, subtotal_cents, discount_cents, shipping_cents, tax_cents,
    total_cents, discount_code, shipping_address, billing_address, note,
    idempotency_key, placed_at
  ) values (
    p_customer_id, p_email, p_phone, 'pending', 'unpaid', 'unfulfilled',
    v_currency, v_subtotal, v_discount, p_shipping_cents, v_tax,
    v_total, p_discount_code, p_shipping_address, p_billing_address, p_note,
    p_idempotency_key, now()
  )
  returning * into v_order;

  -- Reserve stock and freeze a snapshot per line.
  --
  -- ORDER BY ci.variant_id is load-bearing: it fixes the order in which stock
  -- rows are locked, so concurrent carts sharing variants queue rather than
  -- deadlock.
  for v_item in
    select
      ci.variant_id,
      ci.quantity,
      v.price_cents,
      v.sku,
      v.title            as variant_title,
      v.product_id,
      v.inventory_tracked,
      v.allow_backorder,
      v.inventory_quantity,
      p.title            as product_title,
      p.slug             as product_slug,
      p.currency         as currency,
      (
        select coalesce(pi.external_url, pi.storage_path)
        from product_images pi
        where pi.product_id = p.id
        order by pi.is_primary desc, pi.position asc
        limit 1
      ) as image_url
    from cart_items ci
    join product_variants v on v.id = ci.variant_id
    join products p on p.id = v.product_id
    where ci.cart_id = p_cart_id
    order by ci.variant_id
  loop
    /*
     * This is an early, friendly check only. It reads the quantity without a
     * lock, so a competing checkout may still take the last unit between here
     * and the decrement — which is exactly why adjust_inventory re-checks
     * under a row lock and raises. That second check is the real guard.
     */
    if v_item.inventory_tracked and not v_item.allow_backorder
       and v_item.inventory_quantity < v_item.quantity then
      raise exception 'insufficient_inventory'
        using detail = format('%s (%s): %s left, %s requested',
                              v_item.product_title, v_item.variant_title,
                              v_item.inventory_quantity, v_item.quantity);
    end if;

    perform adjust_inventory(
      v_item.variant_id, -v_item.quantity, 'sale', v_order.id, 'checkout'
    );

    insert into order_items (
      order_id, variant_id, product_id, product_title, variant_title,
      product_slug, sku, image_url, unit_price_cents, quantity,
      subtotal_cents, snapshot
    ) values (
      v_order.id, v_item.variant_id, v_item.product_id, v_item.product_title,
      v_item.variant_title, v_item.product_slug, v_item.sku, v_item.image_url,
      v_item.price_cents, v_item.quantity,
      v_item.price_cents * v_item.quantity,
      jsonb_build_object(
        'product_title', v_item.product_title,
        'variant_title', v_item.variant_title,
        'sku', v_item.sku,
        'unit_price_cents', v_item.price_cents,
        'currency', v_item.currency,
        'captured_at', now()
      )
    );
  end loop;

  update carts set completed_at = now() where id = p_cart_id;

  return v_order;
end;
$$;

revoke all on function create_order_from_cart(uuid, text, jsonb, jsonb, integer, text, uuid, text, text, text) from anon, authenticated;

-- restock_order takes the same locks in reverse situations (cancellations,
-- failed payments, refunds), so it needs the same deterministic order to avoid
-- deadlocking against a concurrent checkout.
create or replace function restock_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  -- Only restock if we have not already done so for this order.
  if exists (
    select 1 from inventory_movements
    where order_id = p_order_id and reason = 'cancellation'
  ) then
    return;
  end if;

  for v_item in
    select variant_id, quantity from order_items
    where order_id = p_order_id and variant_id is not null
    order by variant_id
  loop
    perform adjust_inventory(
      v_item.variant_id, v_item.quantity, 'cancellation', p_order_id, 'order cancelled'
    );
  end loop;
end;
$$;

revoke all on function restock_order(uuid) from anon, authenticated;
