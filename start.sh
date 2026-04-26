#!/usr/bin/env bash
set -euo pipefail

# Создаём папку для БД (если подключите persistent disk — монтируйте сюда)
mkdir -p /data

# Стартуем FastAPI локально (наружу не публикуем)
uvicorn api.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips='*' &
API_PID=$!

# Аккуратно гасим оба процесса
term_handler() {
  kill -TERM "$API_PID" 2>/dev/null || true
  nginx -s quit 2>/dev/null || true
}
trap term_handler SIGTERM SIGINT

# Стартуем Nginx
nginx -g 'daemon off;' &
NGINX_PID=$!

# Ждём, пока один из процессов не упадёт
wait -n "$API_PID" "$NGINX_PID"
EXIT_CODE=$?

# На всякий случай гасим второй процесс
kill -TERM "$API_PID" "$NGINX_PID" 2>/dev/null || true
wait || true

exit "$EXIT_CODE"
