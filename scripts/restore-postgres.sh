#!/usr/bin/env bash
set -euo pipefail
umask 077
trap 'echo "{\"level\":\"error\",\"event\":\"database.restore_failed\",\"errorId\":\"RESTORE_COMMAND_FAILED\"}" >&2' ERR

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${RESTORE_BACKUP_FILE:?RESTORE_BACKUP_FILE is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
: "${POSTGRES_BIN_DIR:=}"
pg_restore_command="${POSTGRES_BIN_DIR:+${POSTGRES_BIN_DIR}/}pg_restore"
psql_command="${POSTGRES_BIN_DIR:+${POSTGRES_BIN_DIR}/}psql"
if [[ "$RESTORE_DATABASE_URL" == "${DATABASE_URL:-__unset__}" || "$RESTORE_DATABASE_URL" == "${DIRECT_URL:-__unset__}" ]]; then
  echo '{"level":"error","event":"database.restore_refused","errorId":"TARGET_MATCHES_APPLICATION_DATABASE"}' >&2
  exit 1
fi
if [[ ! -f "$RESTORE_BACKUP_FILE" || ! -f "${RESTORE_BACKUP_FILE}.sha256" ]]; then echo '{"level":"error","event":"database.restore_failed","errorId":"BACKUP_OR_CHECKSUM_MISSING"}' >&2; exit 1; fi

expected="$(cut -d ' ' -f 1 "${RESTORE_BACKUP_FILE}.sha256")"
actual="$(shasum -a 256 "$RESTORE_BACKUP_FILE" | cut -d ' ' -f 1)"
[[ "$expected" == "$actual" ]] || { echo '{"level":"error","event":"database.restore_failed","errorId":"CHECKSUM_MISMATCH"}' >&2; exit 1; }
temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
plain="$temporary_directory/database.dump"
openssl enc -d -aes-256-cbc -pbkdf2 -in "$RESTORE_BACKUP_FILE" -out "$plain" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
"$pg_restore_command" --list "$plain" >/dev/null
"$pg_restore_command" --exit-on-error --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" "$plain"
"$psql_command" "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null
printf '{"timestamp":"%s","level":"info","event":"database.restore_completed","integrity":"verified"}\n' "$(date -u +%FT%TZ)"
