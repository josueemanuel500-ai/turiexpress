# Despliegue de la API

La API escucha solo en `127.0.0.1:3000`. El único acceso externo debe ser el
túnel de Cloudflare configurado para `api.turiexpress.com.mx`.

1. Crear la base de datos y ejecutar `migrations/001_reservations.sql`.
2. Copiar `.env.example` como `.env` y sustituir todos los secretos.
3. Ejecutar `npm ci` y `npm run build` dentro de `server/`.
4. Copiar `deploy/turiexpress-api.service` a `/etc/systemd/system/`.
5. Ejecutar `sudo systemctl daemon-reload && sudo systemctl enable --now turiexpress-api`.

Para comprobar el servicio localmente:

```bash
curl http://127.0.0.1:3000/v1/health
```
