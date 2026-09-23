# TURI EXPRESS MX

Sitio para solicitar la renta de Nissan Urvan mediante WhatsApp, con disponibilidad real (Supabase) y un panel de personal para gestionar las 3 unidades.

## Publicación

El sitio no requiere compilación: `index.html` es el punto de entrada.

**Hostinger (hosting compartido):** sube el contenido de este repositorio (todos los archivos de la raíz: `index.html`, `styles.css`, `app.js`, `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `og-image.jpg`) a `public_html` mediante el Administrador de archivos de hPanel o por FTP. No hay build ni dependencias que instalar.

**GitHub Pages (alternativa):** selecciona la rama `main` y la carpeta raíz en la configuración del repositorio.

Dominio configurado en las meta tags (Open Graph/Twitter): `https://turiexpress.mx/`. Si el dominio final cambia, actualiza `og:url`, `og:image`, `twitter:image` y `link[rel=canonical]` en `index.html`.

## Configuración antes de publicar

Edita `WHATSAPP_NUMBER` en `app.js` con el número real del negocio: código de país + número, sin `+`, espacios ni guiones. Ejemplo para México: `5213312345678`.

Reemplaza `G-XXXXXXXXXX` por el ID de medición real de Google Analytics 4 en el `<head>` de cada página HTML (busca "gtag" en el repo para ubicarlos todos). Mientras quede el placeholder, las páginas cargan el script pero no se registra ningún dato.

Las solicitudes se guardan en Supabase (para la disponibilidad compartida) y además abren WhatsApp con el mensaje prellenado para confirmar con el cliente.

## Assets

- `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png`: ícono de la pestaña y de acceso directo en iOS.
- `og-image.jpg` (1200×630): imagen que se muestra al compartir el enlace en WhatsApp, Facebook, LinkedIn y X.
- Las fotos (`urvan-hero.webp`, `urvan-flota.webp`) están en WebP para que pesen poco. Si agregas una foto nueva, expórtala en WebP (calidad ~80) en vez de PNG: un PNG de una foto puede pesar 10-20 veces más sin verse mejor.

## Acceso de personal

No hay ningún enlace visible al panel de personal en el sitio. Se abre tocando 4 veces seguidas el logo "TURI EXPRESS" del encabezado (en menos de medio segundo entre toques): en `index.html`/`disponibilidad.html` abre el panel directamente; en el resto de páginas navega a `disponibilidad.html?admin=1`, que lo abre automáticamente. También puedes ir directo a esa URL.

## Disponibilidad y panel de personal (Supabase)

El calendario público y el panel de "Personal" usan un proyecto de Supabase (`SUPABASE_URL` / `SUPABASE_ANON_KEY` en `app.js`) con dos tablas: `units` (las 3 Nissan Urvan) y `bookings` (solicitudes públicas y ocupaciones cargadas por el personal). El esquema completo, con las políticas de seguridad (RLS), está documentado en [`supabase/schema.sql`](supabase/schema.sql).

Cómo funciona la seguridad:
- Cualquier visitante puede ver qué fechas están ocupadas (sin nombre ni teléfono del cliente) y enviar una solicitud — queda guardada como `pending` hasta que el personal la revise.
- Solo el personal con sesión iniciada puede ver el nombre/teléfono/nota de cada reserva, agregar ocupaciones manuales o eliminar reservas.
- La clave publicada en `app.js` es segura de exponer: el control de acceso real está en las políticas de la base de datos, no en ocultar la clave.

## Páginas legales y retención de datos

- [`aviso-privacidad.html`](aviso-privacidad.html): aviso de privacidad conforme a la LFPDPPP (México). Declara que **no se comparten datos con terceros** con fines comerciales y que los registros se eliminan **12 meses después de la fecha de fin de la renta**.
- [`terminos.html`](terminos.html): términos y condiciones del servicio de renta.
- El formulario de solicitud enlaza a ambas páginas antes de enviar.

**El borrado a los 12 meses está implementado de verdad**, no solo escrito: la función `public.delete_expired_bookings()` corre todos los días a las 09:00 UTC mediante `pg_cron` (job `delete-expired-bookings`). Ver [`supabase/schema.sql`](supabase/schema.sql).

Para revisar el estado del borrado automático:

```sql
select jobid, jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;
```

> **Pendiente legal:** el aviso está a nombre comercial "Turi Express MX". La LFPDPPP pide el nombre del responsable (persona física o razón social) y su domicilio. Conviene sustituirlo por el nombre legal completo y agregar un correo de contacto para derechos ARCO (hoy el canal es WhatsApp). Este documento es una base sólida, pero conviene que un abogado lo revise antes de operar a gran escala.

**El proyecto no se pausa solo:** el plan gratuito de Supabase pausa la base de datos tras ~1 semana sin actividad (la primera consulta después de eso tarda uno o dos minutos en responder). El workflow [`.github/workflows/keep-supabase-awake.yml`](.github/workflows/keep-supabase-awake.yml) le hace ping a la API todos los días para evitarlo — corre solo en GitHub Actions, no requiere nada del hosting. Se puede disparar manualmente desde la pestaña **Actions** del repo en GitHub → "Keep Supabase awake" → "Run workflow".

**Dar de alta a una persona del equipo:** en el [dashboard de Supabase](https://supabase.com/dashboard/project/wccrvrnyrsxkccwfqbae) → Authentication → Users → "Add user", crea el usuario con su correo y contraseña. Opcionalmente, en "User Metadata" agrega `{"name": "Su Nombre"}` para que el panel muestre su nombre en vez del correo. No hay alta de personal autoservicio desde el sitio (a propósito: eso requeriría exponer una clave con privilegios administrativos en el navegador).
