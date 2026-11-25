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
