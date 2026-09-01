#!/usr/bin/env bash
#
# Commerce verification against a real Postgres.
#
# Runs the sequential assertions in verify-commerce.sql, then a genuinely
# concurrent test: N parallel sessions all try to buy the same variant at the
# same moment, and exactly as many must succeed as there were units in stock.
#
#   ./scripts/verify-commerce.sh
#
# Point it at any Postgres with the migrations applied:
#   PGHOST=/tmp PGPORT=5433 PGUSER=postgres DBNAME=amiriani_dev ./scripts/verify-commerce.sh

set -euo pipefail

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
DBNAME="${DBNAME:-amiriani_dev}"

DB_URL="postgresql://${PGUSER}@/${DBNAME}?host=${PGHOST}&port=${PGPORT}"

echo "==> Sequential assertions"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f scripts/verify-commerce.sql

# ---------------------------------------------------------------------------
# Concurrency
#
# STOCK units are available and BUYERS sessions each try to buy one, launched
# together. adjust_inventory takes a row lock, so the attempts serialise on that
# row: exactly STOCK should succeed and the rest should fail with
# insufficient_inventory. Anything else means the guard is not holding under
# contention — which is the failure mode that silently oversells in production.
#
# The carts are created and COMMITTED first, then checkout runs in separate
# transactions. That is what the application does — the cart API commits each
# line, and checkout happens in a later request. Building the cart inside the
# same transaction as the checkout would hold the foreign key's KEY SHARE lock
# on the variant row while asking for FOR UPDATE on it, which deadlocks every
# session against every other and measures nothing but the test's own mistake.
# ---------------------------------------------------------------------------

STOCK=5
BUYERS=15

echo
echo "==> Concurrency: ${BUYERS} simultaneous buyers, ${STOCK} units in stock"

psql "$DB_URL" -q <<SQL
update product_variants set inventory_quantity = ${STOCK} where sku = 'CONCURRENCY-1';
delete from orders where email like 'race-%@example.com';
SQL

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Build and commit one cart per buyer, exactly as the cart API would.
for i in $(seq 1 "$BUYERS"); do
  psql "$DB_URL" -q -t -A >"$TMP/cart.$i" <<SQL
with c as (insert into carts default values returning id)
insert into cart_items (cart_id, variant_id, quantity)
select c.id, v.id, 1 from c, product_variants v where v.sku = 'CONCURRENCY-1'
returning cart_id;
SQL
done

# Now fire the checkouts simultaneously.
for i in $(seq 1 "$BUYERS"); do
  (
    # errexit off inside the subshell: a rejected checkout is an expected
    # outcome here, and we need to record its exit code rather than abort.
    set +e
    CART_ID=$(cat "$TMP/cart.$i")
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -t -A >"$TMP/out.$i" 2>"$TMP/err.$i" -c \
      "select create_order_from_cart(
         '${CART_ID}'::uuid,
         'race-${i}@example.com',
         '{\"address1\":\"1 A\",\"city\":\"B\",\"postcode\":\"1000\",\"country_code\":\"BE\"}'::jsonb,
         null, 856, 'race-${i}');"
    echo $? >"$TMP/code.$i"
  ) &
done
wait

SUCCEEDED=0
FAILED=0
for i in $(seq 1 "$BUYERS"); do
  if [ "$(cat "$TMP/code.$i")" = "0" ]; then
    SUCCEEDED=$((SUCCEEDED + 1))
  else
    FAILED=$((FAILED + 1))
    if ! grep -q "insufficient_inventory" "$TMP/err.$i"; then
      echo "    ! buyer ${i} failed for an unexpected reason:"
      head -3 "$TMP/err.$i" | sed 's/^/      /'
    fi
  fi
done

REMAINING=$(psql "$DB_URL" -t -A -c \
  "select inventory_quantity from product_variants where sku = 'CONCURRENCY-1';")
ORDERS=$(psql "$DB_URL" -t -A -c \
  "select count(*) from orders where email like 'race-%@example.com';")
# Scope the journal to this phase's orders: the sequential assertions above sell
# from the same variant, and a time window would sweep those in too.
SOLD=$(psql "$DB_URL" -t -A -c \
  "select coalesce(-sum(m.delta), 0)
     from inventory_movements m
     join orders o on o.id = m.order_id
    where m.reason = 'sale' and o.email like 'race-%@example.com';")

echo "    succeeded: ${SUCCEEDED}   rejected: ${FAILED}"
echo "    stock remaining: ${REMAINING}   orders created: ${ORDERS}   units journalled: ${SOLD}"

FAILURES=0
if [ "$SUCCEEDED" -ne "$STOCK" ]; then
  echo "    FAIL: expected exactly ${STOCK} successful checkouts, got ${SUCCEEDED}"
  FAILURES=1
fi
if [ "$REMAINING" -ne 0 ]; then
  echo "    FAIL: expected stock to land on 0, got ${REMAINING}"
  FAILURES=1
fi
if [ "$ORDERS" -ne "$STOCK" ]; then
  echo "    FAIL: expected ${STOCK} orders, got ${ORDERS}"
  FAILURES=1
fi
if [ "$SOLD" -ne "$STOCK" ]; then
  echo "    FAIL: journal records ${SOLD} units sold, expected ${STOCK}"
  FAILURES=1
fi

# ---------------------------------------------------------------------------
# Idempotency under concurrency: the same key submitted in parallel must yield
# one order, not several. This is the double-click / retried-request case.
# ---------------------------------------------------------------------------

echo
echo "==> Concurrency: same idempotency key submitted 5 times at once"

psql "$DB_URL" -q <<SQL
update product_variants set inventory_quantity = 10 where sku = 'CONCURRENCY-1';
delete from orders where idempotency_key = 'double-submit';
SQL

CART=$(psql "$DB_URL" -t -A <<SQL
with c as (insert into carts default values returning id),
     i as (insert into cart_items (cart_id, variant_id, quantity)
           select c.id, v.id, 1 from c, product_variants v where v.sku = 'CONCURRENCY-1')
select id from c;
SQL
)

for i in 1 2 3 4 5; do
  psql "$DB_URL" -q -t -A >/dev/null 2>&1 <<SQL &
select create_order_from_cart(
  '${CART}'::uuid,
  'double@example.com',
  '{"address1":"1 A","city":"B","postcode":"1000","country_code":"BE"}'::jsonb,
  null, 856, 'double-submit'
);
SQL
done
wait

DUPES=$(psql "$DB_URL" -t -A -c \
  "select count(*) from orders where idempotency_key = 'double-submit';")
DUPE_STOCK=$(psql "$DB_URL" -t -A -c \
  "select inventory_quantity from product_variants where sku = 'CONCURRENCY-1';")

echo "    orders created: ${DUPES}   stock now: ${DUPE_STOCK} (was 10)"
if [ "$DUPES" -ne 1 ]; then
  echo "    FAIL: a repeated idempotency key created ${DUPES} orders"
  FAILURES=1
fi
if [ "$DUPE_STOCK" -ne 9 ]; then
  echo "    FAIL: repeated submits moved stock more than once (${DUPE_STOCK}, expected 9)"
  FAILURES=1
fi

# Clean the fixtures up so a re-run starts from the same place. Carts go before
# variants: cart_items.variant_id is ON DELETE RESTRICT by design.
psql "$DB_URL" -q <<SQL
delete from orders where email like 'race-%@example.com'
   or email in ('double@example.com', 'discount@example.com', 'expired@example.com');
delete from carts c
 where exists (
   select 1 from cart_items ci
   join product_variants v on v.id = ci.variant_id
   join products p on p.id = v.product_id
   where ci.cart_id = c.id and p.slug = 'concurrency-fixture'
 );
delete from products where slug = 'concurrency-fixture';
delete from discount_codes where code in ('VERIFY20', 'EXPIRED50');
SQL

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "==> OK: inventory holds under concurrency and checkout is idempotent"
else
  echo "==> FAILED"
  exit 1
fi
