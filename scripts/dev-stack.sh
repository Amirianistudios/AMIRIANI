#!/usr/bin/env bash
#
# Brings up the whole local stack from nothing: Postgres, PostgREST, the
# Supabase-shaped façade, and (optionally) the app.
#
#   ./scripts/dev-stack.sh          start everything, import the catalogue
#   ./scripts/dev-stack.sh --stop   stop everything
#   ./scripts/dev-stack.sh --no-import
#
# Written because the four-step sequence in the README is easy to get subtly
# wrong — and because an ephemeral dev container throws the database away, so
# this gets run more often than it looks.
#
# Everything lives under STACK_DIR (default .devstack/) so a rebuild is one
# `rm -rf` away.

set -euo pipefail
cd "$(dirname "$0")/.."

STACK_DIR="${STACK_DIR:-$PWD/.devstack}"
PGPORT="${PGPORT:-5433}"
PGRST_PORT="${PGRST_PORT:-3001}"
SHIM_PORT="${SHIM_PORT:-54321}"
DBNAME="${DBNAME:-amiriani_dev}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
PGDATA="$STACK_DIR/pgdata"
LOGS="$STACK_DIR/logs"
DB_URL="postgresql://postgres@/${DBNAME}?host=/tmp&port=${PGPORT}"

stop() {
  echo "==> Stopping"
  [ -f "$STACK_DIR/shim.pid" ] && kill "$(cat "$STACK_DIR/shim.pid")" 2>/dev/null || true
  [ -f "$STACK_DIR/pgrst.pid" ] && kill "$(cat "$STACK_DIR/pgrst.pid")" 2>/dev/null || true
  if [ -d "$PGDATA" ]; then
    OWNER=$(stat -c '%U' "$PGDATA")
    su "$OWNER" -s /bin/bash -c "'$PGBIN/pg_ctl' -D '$PGDATA' -m fast stop" >/dev/null 2>&1 || true
  fi
  rm -f "$STACK_DIR"/*.pid
  echo "    stopped"
}

if [ "${1:-}" = "--stop" ]; then stop; exit 0; fi

mkdir -p "$LOGS"

# --------------------------------------------------------------------- Postgres
#
# Postgres refuses to run as root, and dev containers usually are root. Run the
# server as an unprivileged user, creating one if the image has none.
PGUSER_SYS="${PGUSER_SYS:-}"
if [ "$(id -u)" = "0" ]; then
  if [ -z "$PGUSER_SYS" ]; then
    for candidate in postgres ubuntu nobody; do
      if getent passwd "$candidate" >/dev/null; then PGUSER_SYS="$candidate"; break; fi
    done
  fi
  if [ -z "$PGUSER_SYS" ]; then
    useradd -m -s /bin/bash pgrunner 2>/dev/null || true
    PGUSER_SYS=pgrunner
  fi
  mkdir -p "$PGDATA" "$LOGS"
  chown -R "$PGUSER_SYS" "$STACK_DIR"
  as_pg() { su "$PGUSER_SYS" -s /bin/bash -c "$1"; }
else
  as_pg() { bash -c "$1"; }
fi

if [ ! -d "$PGDATA/base" ]; then
  echo "==> Initialising Postgres in $PGDATA"
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"
  [ "$(id -u)" = "0" ] && chown "$PGUSER_SYS" "$PGDATA"
  as_pg "'$PGBIN/initdb' -D '$PGDATA' -U postgres --auth=trust" >"$LOGS/initdb.log" 2>&1
fi

if ! pg_isready -h /tmp -p "$PGPORT" >/dev/null 2>&1; then
  echo "==> Starting Postgres on port $PGPORT"
  as_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -l '$LOGS/postgres.log' -o '-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1' -w start" >/dev/null
fi

if ! psql "postgresql://postgres@/postgres?host=/tmp&port=$PGPORT" -tAc \
     "select 1 from pg_database where datname='$DBNAME'" | grep -q 1; then
  echo "==> Creating $DBNAME and applying the schema"
  psql "postgresql://postgres@/postgres?host=/tmp&port=$PGPORT" -q -c "create database $DBNAME"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f scripts/supabase-shim.sql
  for f in supabase/migrations/*.sql; do
    printf '    %s\n' "$(basename "$f")"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$f"
  done
fi

# -------------------------------------------------------------------- PostgREST
PGRST_BIN="${PGRST_BIN:-$(command -v postgrest || true)}"
if [ -z "$PGRST_BIN" ] && [ -x "$STACK_DIR/postgrest" ]; then PGRST_BIN="$STACK_DIR/postgrest"; fi
if [ -z "$PGRST_BIN" ]; then
  echo "!! postgrest not found. Put the binary on PATH or at $STACK_DIR/postgrest" >&2
  exit 1
fi

if ! curl -s -o /dev/null -m 2 "http://127.0.0.1:$PGRST_PORT/"; then
  echo "==> Starting PostgREST on $PGRST_PORT"
  PGRST_DB_URI="postgresql://postgres@127.0.0.1:$PGPORT/$DBNAME" \
  PGRST_DB_ANON_ROLE=anon \
  PGRST_SERVER_PORT="$PGRST_PORT" \
  PGRST_DB_SCHEMAS=public \
  PGRST_JWT_SECRET="${LOCAL_JWT_SECRET:-local-development-jwt-secret-at-least-32-chars}" \
    setsid nohup "$PGRST_BIN" >"$LOGS/postgrest.log" 2>&1 &
  echo $! >"$STACK_DIR/pgrst.pid"
  sleep 3
fi

# ------------------------------------------------------------------- the façade
if ! curl -s -o /dev/null -m 2 "http://127.0.0.1:$SHIM_PORT/rest/v1/"; then
  echo "==> Starting the Supabase façade on $SHIM_PORT"
  setsid nohup node scripts/local-supabase.mjs >"$LOGS/shim.log" 2>&1 &
  echo $! >"$STACK_DIR/shim.pid"
  sleep 2
fi

# ----------------------------------------------------------------------- data
COUNT=$(psql "$DB_URL" -tAc "select count(*) from products" 2>/dev/null || echo 0)
if [ "${1:-}" != "--no-import" ] && [ "$COUNT" = "0" ]; then
  echo "==> Importing the catalogue"
  set -a; [ -f .env.local ] && . ./.env.local; set +a
  IMAGE_STRATEGY="${IMAGE_STRATEGY:-storage}" npx tsx scripts/import-to-supabase.ts \
    >"$LOGS/import.log" 2>&1 || { tail -20 "$LOGS/import.log"; exit 1; }
fi

psql "$DB_URL" -q -c "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true

echo
echo "Postgres    /tmp:$PGPORT  ($DBNAME)"
echo "PostgREST   http://127.0.0.1:$PGRST_PORT"
echo "Supabase    http://127.0.0.1:$SHIM_PORT"
psql "$DB_URL" -tAc \
  "select '   catalogue  ' || (select count(*) from products where status='active') || ' products, '
        || (select count(*) from product_variants) || ' variants, '
        || (select count(*) from product_images) || ' images'"
echo
echo "Next:  ALLOW_LOCAL_IMAGE_HOSTS=1 npm run dev"
