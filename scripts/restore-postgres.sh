#!/usr/bin/env bash
set -euo pipefail
umask 077
trap 'echo "{\"level\":\"error\",\"event\":\"database.restore_failed\",\"errorId\":\"RESTORE_COMMAND_FAILED\"}" >&2' ERR

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${RESTORE_CONFIRM_ISOLATED_DATABASE:?RESTORE_CONFIRM_ISOLATED_DATABASE is required}"
: "${POSTGRES_BIN_DIR:=}"
pg_restore_command="${POSTGRES_BIN_DIR:+${POSTGRES_BIN_DIR}/}pg_restore"
psql_command="${POSTGRES_BIN_DIR:+${POSTGRES_BIN_DIR}/}psql"
if [[ "$RESTORE_CONFIRM_ISOLATED_DATABASE" != "true" ]]; then
  echo '{"level":"error","event":"database.restore_refused","errorId":"ISOLATED_CONFIRMATION_REQUIRED"}' >&2
  exit 1
fi
if [[ "$RESTORE_DATABASE_URL" == "${DATABASE_URL:-__unset__}" || "$RESTORE_DATABASE_URL" == "${DIRECT_URL:-__unset__}" || "$RESTORE_DATABASE_URL" == "${BACKUP_DATABASE_URL:-__unset__}" ]]; then
  echo '{"level":"error","event":"database.restore_refused","errorId":"TARGET_MATCHES_APPLICATION_DATABASE"}' >&2
  exit 1
fi
temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
if [[ -n "${RESTORE_BACKUP_KEY:-}" ]]; then
  RESTORE_BACKUP_FILE="$temporary_directory/retrieved.dump.enc"
  ./node_modules/.bin/tsx scripts/database-backup-object.ts download --key="$RESTORE_BACKUP_KEY" --destination="$RESTORE_BACKUP_FILE" --apply
fi
: "${RESTORE_BACKUP_FILE:?RESTORE_BACKUP_FILE or RESTORE_BACKUP_KEY is required}"
if [[ ! -f "$RESTORE_BACKUP_FILE" || ! -f "${RESTORE_BACKUP_FILE}.sha256" ]]; then echo '{"level":"error","event":"database.restore_failed","errorId":"BACKUP_OR_CHECKSUM_MISSING"}' >&2; exit 1; fi

expected="$(cut -d ' ' -f 1 "${RESTORE_BACKUP_FILE}.sha256")"
if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$RESTORE_BACKUP_FILE" | cut -d ' ' -f 1)"; else actual="$(shasum -a 256 "$RESTORE_BACKUP_FILE" | cut -d ' ' -f 1)"; fi
[[ "$expected" == "$actual" ]] || { echo '{"level":"error","event":"database.restore_failed","errorId":"CHECKSUM_MISMATCH"}' >&2; exit 1; }
plain="$temporary_directory/database.dump"
openssl enc -d -aes-256-cbc -pbkdf2 -in "$RESTORE_BACKUP_FILE" -out "$plain" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
"$pg_restore_command" --list "$plain" >/dev/null
"$pg_restore_command" --exit-on-error --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" "$plain"
"$psql_command" "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
printf '{"timestamp":"%s","level":"info","event":"database.restore_completed","integrity":"verified"}\n' "$(date -u +%FT%TZ)"
