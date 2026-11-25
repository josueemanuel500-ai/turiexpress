#!/usr/bin/env bash
# Respaldo nocturno (cron, 02:30). Guarda 30 copias de la base de datos en ~/backups y, si rclone
# tiene configurado el remoto "respaldo" (Google Drive u otro), sube una copia fuera del servidor
# junto con las fotos de revisión. El panel muestra el resultado en Ajustes → Sistema y respaldos.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/bin:$PATH"
set -a; . ./.env; set +a

DIR="$HOME/backups"; mkdir -p "$DIR"
STATUS="$DIR/status.json"
FILE="$DIR/turiexpress-$(date +%F-%H%M).dump"
ping_hc() { [ -n "${HEALTHCHECK_BACKUP_URL:-}" ] && curl -fsS -m 10 "$HEALTHCHECK_BACKUP_URL$1" >/dev/null 2>&1; true; }

if ! pg_dump "$DATABASE_URL" -Fc -f "$FILE"; then
  printf '{"ok":false,"error":"No se pudo respaldar la base de datos","at":"%s"}\n' "$(date -Iseconds)" > "$STATUS"
  ping_hc /fail
  exit 1
fi
ls -1t "$DIR"/turiexpress-*.dump | tail -n +31 | xargs -r rm --

OFFSITE="no_configurado"
if command -v rclone >/dev/null 2>&1 && rclone listremotes 2>/dev/null | grep -qx 'respaldo:'; then
  if rclone copy "$FILE" respaldo:turiexpress-respaldos/base-de-datos \
     && { [ ! -d uploads ] || rclone copy uploads respaldo:turiexpress-respaldos/fotos; }; then
    rclone delete --min-age 60d respaldo:turiexpress-respaldos/base-de-datos >/dev/null 2>&1
    OFFSITE="ok"
  else
    OFFSITE="error"
  fi
fi

printf '{"ok":%s,"at":"%s","file":"%s","size":%s,"local_copies":%s,"offsite":"%s"}\n' \
  "$([ "$OFFSITE" = error ] && echo false || echo true)" "$(date -Iseconds)" "$(basename "$FILE")" \
  "$(stat -c %s "$FILE")" "$(ls -1 "$DIR"/turiexpress-*.dump | wc -l)" "$OFFSITE" > "$STATUS"
[ "$OFFSITE" = error ] && ping_hc /fail || ping_hc ""
