#!/usr/bin/env bash
#
# Applies supabase/migrations to a throwaway local Postgres and runs assertions
# against the result. Catches ordering mistakes, broken constraints and RLS
# regressions without needing a live Supabase project.
#
#   ./scripts/verify-db.sh
#
# Requires a running Postgres. Set PGHOST/PGPORT/PGUSER, or leave the defaults
# to use the socket-based instance the repo's dev setup starts on port 5433.

set -euo pipefail

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
DBNAME="${DBNAME:-amiriani_verify}"

ADMIN_URL="postgresql://${PGUSER}@/postgres?host=${PGHOST}&port=${PGPORT}"
DB_URL="postgresql://${PGUSER}@/${DBNAME}?host=${PGHOST}&port=${PGPORT}"

echo "==> Recreating ${DBNAME}"
psql "$ADMIN_URL" -q -c "drop database if exists ${DBNAME};" >/dev/null
psql "$ADMIN_URL" -q -c "create database ${DBNAME};" >/dev/null

echo "==> Applying Supabase shim"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f scripts/supabase-shim.sql

echo "==> Applying migrations"
for file in supabase/migrations/*.sql; do
  printf '    %s\n' "$(basename "$file")"
  # Each migration runs in its own transaction, exactly as Supabase applies it,
  # so a partial migration can never leave the schema half-built.
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f "$file"
done

echo "==> Running assertions"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q --single-transaction -f scripts/verify-db.sql

echo "==> OK: schema applies cleanly and all assertions pass"
