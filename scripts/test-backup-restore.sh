#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ -f .env ]]; then set -a; source .env; set +a; fi
if [[ -d /opt/homebrew/opt/postgresql@16/bin ]]; then export POSTGRES_BIN_DIR=/opt/homebrew/opt/postgresql@16/bin; fi

source_url="${DIRECT_URL:?DIRECT_URL is required}"
admin_url="${TEST_DATABASE_ADMIN_URL:-$(node -e 'const u=new URL(process.argv[1]);u.pathname="/postgres";u.search="";process.stdout.write(u.toString())' "$source_url") }"
admin_url="${admin_url% }"
suffix="$(date +%s)_$$"
source_name="ufo_backup_source_${suffix}"
restore_name="ufo_backup_restore_${suffix}"
temporary_directory="$(mktemp -d)"
cleanup() {
  dropdb --if-exists --maintenance-db="$admin_url" "$source_name" >/dev/null 2>&1 || true
  dropdb --if-exists --maintenance-db="$admin_url" "$restore_name" >/dev/null 2>&1 || true
  rm -rf "$temporary_directory"
}
trap cleanup EXIT
createdb --maintenance-db="$admin_url" "$source_name"
createdb --maintenance-db="$admin_url" "$restore_name"
source_database_url="$(node -e 'const u=new URL(process.argv[1]);u.pathname=`/${process.argv[2]}`;process.stdout.write(u.toString())' "$admin_url" "$source_name")"
restore_database_url="$(node -e 'const u=new URL(process.argv[1]);u.pathname=`/${process.argv[2]}`;process.stdout.write(u.toString())' "$admin_url" "$restore_name")"
DATABASE_URL="$source_database_url" DIRECT_URL="$source_database_url" npx prisma migrate deploy --config prisma7.config.ts >/dev/null
marker="backup-drill-${suffix}"
psql "$source_database_url" -v ON_ERROR_STOP=1 -c "INSERT INTO \"OperationalLease\" (\"name\",\"holder\",\"expiresAt\",\"createdAt\",\"updatedAt\") VALUES ('$marker','drill',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)" >/dev/null
backup_root="$temporary_directory/private-object-store"
BACKUP_DATABASE_URL="$source_database_url" DATABASE_BACKUP_DRIVER="local" DATABASE_BACKUP_ROOT="$backup_root" BACKUP_ENCRYPTION_PASSPHRASE="local-disposable-drill-passphrase" bash scripts/backup-postgres.sh >/dev/null
backup_file="$(find "$backup_root/database" -name '*.dump.enc' -type f | head -1)"
backup_key="database/$(basename "$backup_file")"
RESTORE_DATABASE_URL="$restore_database_url" RESTORE_BACKUP_KEY="$backup_key" RESTORE_CONFIRM_ISOLATED_DATABASE="true" DATABASE_BACKUP_DRIVER="local" DATABASE_BACKUP_ROOT="$backup_root" BACKUP_ENCRYPTION_PASSPHRASE="local-disposable-drill-passphrase" DATABASE_URL="$source_database_url" DIRECT_URL="$source_database_url" BACKUP_DATABASE_URL="$source_database_url" bash scripts/restore-postgres.sh >/dev/null
restored="$(psql "$restore_database_url" -Atc "SELECT COUNT(*) FROM \"OperationalLease\" WHERE \"name\" = '$marker'")"
[[ "$restored" == "1" ]] || { echo '{"level":"error","event":"database.backup_restore_drill_failed","errorId":"MARKER_MISSING"}' >&2; exit 1; }
if RESTORE_DATABASE_URL="$source_database_url" RESTORE_BACKUP_KEY="$backup_key" RESTORE_CONFIRM_ISOLATED_DATABASE="true" DATABASE_BACKUP_DRIVER="local" DATABASE_BACKUP_ROOT="$backup_root" BACKUP_ENCRYPTION_PASSPHRASE="local-disposable-drill-passphrase" BACKUP_DATABASE_URL="$source_database_url" bash scripts/restore-postgres.sh >/dev/null 2>&1; then
  echo '{"level":"error","event":"database.backup_restore_drill_failed","errorId":"LIVE_TARGET_GUARD_FAILED"}' >&2
  exit 1
fi
if RESTORE_DATABASE_URL="$restore_database_url" RESTORE_BACKUP_KEY="$backup_key" RESTORE_CONFIRM_ISOLATED_DATABASE="false" DATABASE_BACKUP_DRIVER="local" DATABASE_BACKUP_ROOT="$backup_root" BACKUP_ENCRYPTION_PASSPHRASE="local-disposable-drill-passphrase" BACKUP_DATABASE_URL="$source_database_url" bash scripts/restore-postgres.sh >/dev/null 2>&1; then
  echo '{"level":"error","event":"database.backup_restore_drill_failed","errorId":"ISOLATED_CONFIRMATION_GUARD_FAILED"}' >&2
  exit 1
fi
printf '{"timestamp":"%s","level":"info","event":"database.backup_restore_drill_completed","rpo":"validated-local","rtoSeconds":%s}\n' "$(date -u +%FT%TZ)" "$SECONDS"
