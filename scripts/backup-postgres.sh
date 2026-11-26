#!/usr/bin/env bash
set -euo pipefail
umask 077
trap 'echo "{\"level\":\"error\",\"event\":\"database.backup_failed\",\"errorId\":\"BACKUP_COMMAND_FAILED\"}" >&2' ERR

: "${BACKUP_DATABASE_URL:=${DIRECT_URL:-}}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${DATABASE_BACKUP_DRIVER:=local}"
: "${DATABASE_BACKUP_ROOT:=.data/database-backup-objects}"
: "${POSTGRES_BIN_DIR:=}"
pg_dump_command="${POSTGRES_BIN_DIR:+${POSTGRES_BIN_DIR}/}pg_dump"
pg_restore_command="${POSTGRES_BIN_DIR:+${POSTGRES_BIN_DIR}/}pg_restore"
if [[ -z "$BACKUP_DATABASE_URL" ]]; then echo '{"level":"error","event":"database.backup_failed","errorId":"DATABASE_URL_MISSING"}' >&2; exit 1; fi
./node_modules/.bin/tsx scripts/validate-service-environment.ts database-backup

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain="$temporary_directory/database.dump"
encrypted="$temporary_directory/what-the-ufo-${timestamp}.dump.enc"
object_key="database/what-the-ufo-${timestamp}.dump.enc"

"$pg_dump_command" --format=custom --no-owner --no-privileges --file="$plain" "$BACKUP_DATABASE_URL"
"$pg_restore_command" --list "$plain" >/dev/null
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$plain" -out "$encrypted" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
./node_modules/.bin/tsx scripts/database-backup-object.ts upload --file="$encrypted" --key="$object_key"
printf '{"timestamp":"%s","level":"info","event":"database.backup_completed","integrity":"verified","encrypted":true,"destination":"private-object-storage"}\n' "$(date -u +%FT%TZ)"
