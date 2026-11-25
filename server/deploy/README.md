# API y panel de Turi Express

Servidor propio (Proxmox, Ubuntu 24.04): Node 22 + PostgreSQL 16. Se publica con un túnel de
Cloudflare en `https://api.turiexpress.com.mx`. La API escucha solo en `127.0.0.1:3000`.

- `/` → panel de administración (PWA instalable en iPhone y Android).
- `/v1/public/*` → rutas que usa el sitio público (disponibilidad, tarifas, solicitudes).
- `/v1/ops/*` → rutas del panel; requieren sesión (cookie httpOnly).

## Actualizar

```bash
cd ~/turiexpress && git pull && bash server/deploy/deploy.sh
```

El script respalda la base de datos en `~/backups`, genera las claves push si faltan, compila y
reinicia el servicio. Las migraciones de `migrations/` se aplican solas al arrancar.

## Primera instalación

1. Crear la base de datos y el usuario de PostgreSQL.
2. Copiar `.env.example` como `.env` y llenar los secretos.
3. Copiar `deploy/turiexpress-api.service` a `/etc/systemd/system/` y ejecutar
   `sudo systemctl daemon-reload && sudo systemctl enable --now turiexpress-api`.

## Restaurar un respaldo

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" ~/backups/turiexpress-AAAA-MM-DD-HHMM.dump
```

## Desarrollo local

Con una base local (por ejemplo PGlite en el puerto 55432) y `PG_POOL_MAX=1`:

```bash
npm ci && npm run build && node --env-file=.env dist/index.js
npm test   # pruebas del cálculo de tarifas
```

## Respaldo fuera del servidor (Google Drive) y monitoreo

El respaldo nocturno (`deploy/backup.sh`, 02:30) se instala solo con `deploy.sh` y guarda 30 copias en `~/backups`.
Para que además suba una copia fuera del servidor (base de datos + fotos), configura **rclone** una vez:

1. En el servidor instala rclone: `sudo -v ; curl https://rclone.org/install.sh | sudo bash`
2. En tu computadora (con navegador) instala rclone y ejecuta `rclone authorize "drive"`; copia el texto que imprime.
3. En el servidor: `rclone config` → `n` (nuevo) → nombre **respaldo** → tipo **drive** → deja client id/secret vacíos →
   scope `1` → en "Use web browser to automatically authenticate?" responde **n** y pega el texto del paso 2.
4. Prueba: `bash ~/turiexpress/server/deploy/backup.sh && cat ~/backups/status.json` → `"offsite":"ok"`.

**Monitoreo** (gratis en healthchecks.io): crea dos checks, "API" (periodo 5 min) y "Respaldo" (periodo 1 día), con aviso
por correo o Telegram. Agrega a `server/.env`:

```
HEALTHCHECK_URL=https://hc-ping.com/<uuid-del-check-API>
HEALTHCHECK_BACKUP_URL=https://hc-ping.com/<uuid-del-check-Respaldo>
```

y reinicia (`bash deploy/deploy.sh`). Si el servidor se apaga o pierde internet, te llega el aviso.
En Ajustes → Sistema y respaldos se ve el estado de ambos.
