#!/usr/bin/env bash
# Control local de Ruta: API (8001) + Vite (5173) + Postgres (5433 por defecto).
# Uso:
#   ./dev.sh up
#   ./dev.sh log [api|web|all]
#   ./dev.sh down

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.dev"
LOG_DIR="$RUN_DIR/logs"
PID_API="$RUN_DIR/api.pid"
PID_WEB="$RUN_DIR/web.pid"
API_PORT="${API_PORT:-8001}"
WEB_PORT="${WEB_PORT:-5173}"
DB_PORT="${DB_PORT:-5433}"
PORTS=("$API_PORT" "$WEB_PORT" 5174 8000)

mkdir -p "$LOG_DIR"

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "  · matando puerto $port ($pids)"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

kill_pidfile() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 0.3
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

cmd_down() {
  echo "Bajando servicios de desarrollo…"
  kill_pidfile "$PID_API"
  kill_pidfile "$PID_WEB"
  for port in "${PORTS[@]}"; do
    kill_port "$port"
  done
  if [[ "${1:-}" == "--db" ]] || [[ "${DOWN_DB:-0}" == "1" ]]; then
    echo "  · deteniendo Postgres (docker compose)"
    (cd "$ROOT" && docker compose stop db >/dev/null 2>&1 || true)
  fi
  echo "Listo. Puertos liberados: ${PORTS[*]}"
}

wait_port() {
  local port="$1"
  local name="$2"
  local tries=40
  while (( tries > 0 )); do
    if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "  · $name listo en :$port"
      return 0
    fi
    sleep 0.25
    tries=$((tries - 1))
  done
  echo "  · aviso: $name no respondió a tiempo en :$port" >&2
  return 1
}

port_is_busy() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

choose_db_port() {
  local existing_container=""
  local existing_port=""
  local existing_state=""
  local candidate="$DB_PORT"
  local last_candidate=$((DB_PORT + 20))

  if command -v docker >/dev/null 2>&1; then
    existing_container="$(cd "$ROOT" && docker compose ps -q db 2>/dev/null || true)"
    if [[ -n "$existing_container" ]]; then
      existing_state="$(docker inspect -f '{{.State.Status}}' "$existing_container" 2>/dev/null || true)"
      existing_port="$(docker port "$existing_container" 5432/tcp 2>/dev/null | sed -n '1s/.*://p')"
    fi
    if [[ "$existing_port" =~ ^[0-9]+$ ]] && [[ "$existing_state" == "running" ]]; then
      DB_PORT="$existing_port"
      return 0
    fi
    if [[ "$existing_port" =~ ^[0-9]+$ ]] && ! port_is_busy "$existing_port"; then
      candidate="$existing_port"
    fi
  fi

  while (( candidate <= last_candidate )) && port_is_busy "$candidate"; do
    candidate=$((candidate + 1))
  done

  if (( candidate > last_candidate )); then
    echo "No hay un puerto libre para Postgres entre $DB_PORT y $last_candidate." >&2
    return 1
  fi

  if [[ "$candidate" != "$DB_PORT" ]]; then
    echo "  · puerto $DB_PORT ocupado; usando Postgres en :$candidate"
    DB_PORT="$candidate"
  fi
}

cmd_up() {
  cmd_down
  echo "Levantando entorno local…"

  if command -v docker >/dev/null 2>&1; then
    choose_db_port
    echo "  · Postgres (docker compose)"
    (cd "$ROOT" && DB_PORT="$DB_PORT" docker compose up -d db)
  else
    echo "  · docker no disponible; se asume Postgres en :$DB_PORT"
  fi

  echo "  · API uvicorn :$API_PORT"
  API_DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://ruta:ruta@127.0.0.1:$DB_PORT/ruta}"
  (
    cd "$ROOT/backend"
    DATABASE_URL="$API_DATABASE_URL" nohup uv run uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" --reload \
      >"$LOG_DIR/api.log" 2>&1 &
    echo $! >"$PID_API"
  )

  echo "  · Vite :$WEB_PORT"
  (
    cd "$ROOT/frontend"
    nohup npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" \
      >"$LOG_DIR/web.log" 2>&1 &
    echo $! >"$PID_WEB"
  )

  wait_port "$API_PORT" "API" || true
  wait_port "$WEB_PORT" "Vite" || true

  cat <<EOF

Ruta en marcha:
  App   http://127.0.0.1:$WEB_PORT/
  API   http://127.0.0.1:$API_PORT/
  DB    localhost:$DB_PORT
  Logs  ./dev.sh log

EOF
}

cmd_log() {
  local target="${1:-all}"
  case "$target" in
    api)
      [[ -f "$LOG_DIR/api.log" ]] || { echo "No hay log de API aún."; exit 1; }
      echo "=== api.log (Ctrl+C para salir) ==="
      tail -n 80 -f "$LOG_DIR/api.log"
      ;;
    web|vite|frontend)
      [[ -f "$LOG_DIR/web.log" ]] || { echo "No hay log de Vite aún."; exit 1; }
      echo "=== web.log (Ctrl+C para salir) ==="
      tail -n 80 -f "$LOG_DIR/web.log"
      ;;
    all|*)
      [[ -f "$LOG_DIR/api.log" || -f "$LOG_DIR/web.log" ]] || { echo "No hay logs aún. Corre ./dev.sh up"; exit 1; }
      echo "=== api + web (Ctrl+C para salir) ==="
      touch "$LOG_DIR/api.log" "$LOG_DIR/web.log"
      tail -n 40 -f "$LOG_DIR/api.log" "$LOG_DIR/web.log"
      ;;
  esac
}

usage() {
  cat <<'EOF'
Uso: ./dev.sh <comando>

  up              Inicia Postgres, API (8001) y Vite (5173)
  log [api|web]   Sigue los logs (por defecto: ambos)
  down            Mata procesos y libera puertos
  down --db       Además detiene el contenedor de Postgres

Variables opcionales:
  API_PORT=8001 WEB_PORT=5173 DB_PORT=5433 DOWN_DB=1
  Si DB_PORT está ocupado, el script usa automáticamente el siguiente puerto libre.
EOF
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    up) cmd_up "$@" ;;
    log|logs) cmd_log "${1:-all}" ;;
    down|stop|kill) cmd_down "$@" ;;
    -h|--help|help|"") usage ;;
    *)
      echo "Comando desconocido: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
