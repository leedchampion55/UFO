#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.data/postgres"
LOG_FILE="$ROOT_DIR/.data/postgres.log"
PORT="55432"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"

if [ ! -x "$PG_BIN/pg_ctl" ]; then
  echo "PostgreSQL 16 was not found at $PG_BIN. Use Docker Compose or install postgresql@16."
  exit 1
fi

case "${1:-status}" in
  init)
    mkdir -p "$ROOT_DIR/.data"
    if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
      "$PG_BIN/initdb" -D "$DATA_DIR" -U ufo -A trust --no-locale --encoding=UTF8
    fi
    bash "$0" start
    "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U ufo ufo_development 2>/dev/null || true
    echo "Local PostgreSQL is ready on port $PORT."
    ;;
  start)
    mkdir -p "$ROOT_DIR/.data"
    if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
      echo "Run npm run db:init first."
      exit 1
    fi
    if ! "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
      "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" -o "-p $PORT -h 127.0.0.1" start
    fi
    ;;
  stop)
    if [ -f "$DATA_DIR/PG_VERSION" ] && "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
      "$PG_BIN/pg_ctl" -D "$DATA_DIR" stop -m fast
    fi
    ;;
  status)
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" status
    ;;
  *)
    echo "Usage: $0 {init|start|stop|status}"
    exit 1
    ;;
esac
