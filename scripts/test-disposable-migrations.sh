#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env ]]; then set -a; source .env; set +a; fi

source_url="${DIRECT_URL:?DIRECT_URL is required}"
admin_url="${TEST_DATABASE_ADMIN_URL:-$(node -e 'const u=new URL(process.argv[1]);u.pathname="/postgres";u.search="";process.stdout.write(u.toString())' "$source_url") }"
admin_url="${admin_url% }"
name="ufo_migration_test_$(date +%s)_$$"
cleanup() { dropdb --if-exists --maintenance-db="$admin_url" "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
createdb --maintenance-db="$admin_url" "$name"
database_url="$(node -e 'const u=new URL(process.argv[1]);u.pathname=`/${process.argv[2]}`;process.stdout.write(u.toString())' "$admin_url" "$name")"
DATABASE_URL="$database_url" DIRECT_URL="$database_url" npx prisma migrate deploy --config prisma7.config.ts
npx prisma migrate status --config prisma7.config.ts >/dev/null 2>&1
psql "$database_url" -Atc 'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL' | rg '^[1-9][0-9]*$' >/dev/null
printf '{"timestamp":"%s","level":"info","event":"database.migration_drill_completed"}\n' "$(date -u +%FT%TZ)"
