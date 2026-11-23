#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env ]]; then set -a; source .env; set +a; fi

source_url="${DIRECT_URL:?DIRECT_URL is required}"
admin_url="${TEST_DATABASE_ADMIN_URL:-$(node -e 'const u=new URL(process.argv[1]);u.pathname="/postgres";u.search="";process.stdout.write(u.toString())' "$source_url") }"
admin_url="${admin_url% }"
name="ufo_browser_test_$(date +%s)_$$"
runtime_directory="$(mktemp -d)"
cp next-env.d.ts "$runtime_directory/next-env.d.ts"
cp tsconfig.json "$runtime_directory/tsconfig.json"
cleanup() {
  dropdb --if-exists --maintenance-db="$admin_url" "$name" >/dev/null 2>&1 || true
  rm -rf ".data/browser-next-${name}"
  cp "$runtime_directory/next-env.d.ts" next-env.d.ts
  cp "$runtime_directory/tsconfig.json" tsconfig.json
  rm -rf "$runtime_directory"
}
trap cleanup EXIT
createdb --maintenance-db="$admin_url" "$name"
database_url="$(node -e 'const u=new URL(process.argv[1]);u.pathname=`/${process.argv[2]}`;process.stdout.write(u.toString())' "$admin_url" "$name")"
export DATABASE_URL="$database_url"
export DIRECT_URL="$database_url"
export BETTER_AUTH_URL="http://127.0.0.1:3100"
export NEXT_PUBLIC_APP_URL="http://127.0.0.1:3100"
export APP_RUNTIME_MODE="local"
export TRUSTED_PROXY_MODE="local"
export STORAGE_DRIVER="local"
export PRIVATE_MEDIA_ROOT="$runtime_directory/private-media"
export EMAIL_DRIVER="development"
export DEV_MAIL_ROOT="$runtime_directory/dev-mail"
export PUBLIC_SUBMISSIONS_ENABLED="true"
export PORT="3100"
export NEXT_DIST_DIR=".data/browser-next-${name}"
export BROWSER_FIXTURE_PATH="$runtime_directory/browser-fixture.json"
npx prisma migrate deploy --config prisma7.config.ts >/dev/null
npx prisma db seed --config prisma7.config.ts >/dev/null
npx tsx scripts/prepare-browser-fixtures.ts
npm run build >/dev/null
npx playwright test
printf '{"timestamp":"%s","level":"info","event":"browser.smoke_completed","database":"disposable"}\n' "$(date -u +%FT%TZ)"
