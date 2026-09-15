# TURI EXPRESS MX

Sitio para solicitar la renta de Nissan Urvan mediante WhatsApp, con disponibilidad real (Supabase) y un panel de personal para gestionar las 3 unidades.

## Publicación

El sitio no requiere compilación: `index.html` es el punto de entrada.

**Hostinger (hosting compartido):** sube el contenido de este repositorio (todos los archivos de la raíz: `index.html`, `styles.css`, `app.js`, `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `og-image.png`) a `public_html` mediante el Administrador de archivos de hPanel o por FTP. No hay build ni dependencias que instalar.

**GitHub Pages (alternativa):** selecciona la rama `main` y la carpeta raíz en la configuración del repositorio.

Dominio configurado en las meta tags (Open Graph/Twitter): `https://turiexpress.mx/`. Si el dominio final cambia, actualiza `og:url`, `og:image`, `twitter:image` y `link[rel=canonical]` en `index.html`.

## Configuración antes de publicar

Edita `WHATSAPP_NUMBER` en `app.js` con el número real del negocio: código de país + número, sin `+`, espacios ni guiones. Ejemplo para México: `5213312345678`.

Las solicitudes se guardan en Supabase (para la disponibilidad compartida) y además abren WhatsApp con el mensaje prellenado para confirmar con el cliente.

## Assets

- `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png`: ícono de la pestaña y de acceso directo en iOS.
- `og-image.png` (1200×630): imagen que se muestra al compartir el enlace en WhatsApp, Facebook, LinkedIn y X.

## Disponibilidad y panel de personal (Supabase)

El calendario público y el panel de "Personal" usan un proyecto de Supabase (`SUPABASE_URL` / `SUPABASE_ANON_KEY` en `app.js`) con dos tablas: `units` (las 3 Nissan Urvan) y `bookings` (solicitudes públicas y ocupaciones cargadas por el personal). El esquema completo, con las políticas de seguridad (RLS), está documentado en [`supabase/schema.sql`](supabase/schema.sql).

Cómo funciona la seguridad:
- Cualquier visitante puede ver qué fechas están ocupadas (sin nombre ni teléfono del cliente) y enviar una solicitud — queda guardada como `pending` hasta que el personal la revise.
- Solo el personal con sesión iniciada puede ver el nombre/teléfono/nota de cada reserva, agregar ocupaciones manuales o eliminar reservas.
- La clave publicada en `app.js` es segura de exponer: el control de acceso real está en las políticas de la base de datos, no en ocultar la clave.

**Dar de alta a una persona del equipo:** en el [dashboard de Supabase](https://supabase.com/dashboard/project/wccrvrnyrsxkccwfqbae) → Authentication → Users → "Add user", crea el usuario con su correo y contraseña. Opcionalmente, en "User Metadata" agrega `{"name": "Su Nombre"}` para que el panel muestre su nombre en vez del correo. No hay alta de personal autoservicio desde el sitio (a propósito: eso requeriría exponer una clave con privilegios administrativos en el navegador).
