-- Storage buckets for product/collection/site media, plus the transactional
-- order-creation function used by the checkout route.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-media',    'product-media',    true, 20971520,
   array['image/jpeg','image/png','image/webp','image/avif','image/gif']),
  ('collection-media', 'collection-media', true, 20971520,
   array['image/jpeg','image/png','image/webp','image/avif']),
  ('site-media',       'site-media',       true, 20971520,
   array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml'])
on conflict (id) do nothing;

-- Public read for storefront media; writes are admin-only.
create policy "media_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('product-media', 'collection-media', 'site-media'));

create policy "media_admin_write" on storage.objects
  for all to authenticated
  using (
    bucket_id in ('product-media', 'collection-media', 'site-media')
    and is_admin()
  )
  with check (
    bucket_id in ('product-media', 'collection-media', 'site-media')
    and is_admin()
  );

-- ---------------------------------------------------------------------------
-- Transactional order creation
--
-- Takes the cart, re-reads prices from the database (never from the browser),
-- decrements stock under row locks, writes the order plus immutable item
-- snapshots, and marks the cart complete — all in one transaction. If any
-- variant is short of stock the whole thing rolls back.
-- ---------------------------------------------------------------------------

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

  -- Price every line from the database.
  create temporary table _lines on commit drop as
  select
    ci.variant_id,
    ci.quantity,
    v.price_cents,
    v.sku,
    v.title            as variant_title,
    v.product_id,
    p.title            as product_title,
    p.slug             as product_slug,
    p.currency         as currency,
    v.inventory_tracked,
    v.allow_backorder,
    v.inventory_quantity,
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
  where ci.cart_id = p_cart_id;

  if (select count(*) from _lines) = 0 then
    raise exception 'cart_empty';
  end if;

  select coalesce(sum(price_cents * quantity), 0), max(currency)
    into v_subtotal, v_currency
  from _lines;

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
  for v_item in select * from _lines loop
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

-- Restock every line of a cancelled or failed order, exactly once.
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
  loop
    perform adjust_inventory(
      v_item.variant_id, v_item.quantity, 'cancellation', p_order_id, 'order cancelled'
    );
  end loop;
end;
$$;

revoke all on function create_order_from_cart(uuid, text, jsonb, jsonb, integer, text, uuid, text, text, text) from anon, authenticated;
revoke all on function restock_order(uuid) from anon, authenticated;
revoke all on function adjust_inventory(uuid, integer, inventory_reason, uuid, text) from anon, authenticated;
