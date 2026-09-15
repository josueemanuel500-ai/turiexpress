# TURI EXPRESS MX

Sitio estático para solicitar la renta de Nissan Urvan mediante WhatsApp.

## Publicación

El sitio no requiere compilación: `index.html` es el punto de entrada.

**Hostinger (hosting compartido):** sube el contenido de este repositorio (todos los archivos de la raíz: `index.html`, `styles.css`, `app.js`, `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `og-image.png`) a `public_html` mediante el Administrador de archivos de hPanel o por FTP. No hay build ni dependencias que instalar.

**GitHub Pages (alternativa):** selecciona la rama `main` y la carpeta raíz en la configuración del repositorio.

Dominio configurado en las meta tags (Open Graph/Twitter): `https://turiexpress.mx/`. Si el dominio final cambia, actualiza `og:url`, `og:image`, `twitter:image` y `link[rel=canonical]` en `index.html`.

## Configuración antes de publicar

Edita `WHATSAPP_NUMBER` en `app.js` con el número real del negocio: código de país + número, sin `+`, espacios ni guiones. Ejemplo para México: `5213312345678`.

Las solicitudes abren WhatsApp; no se guardan datos de clientes en el sitio.

## Assets

- `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png`: ícono de la pestaña y de acceso directo en iOS.
- `og-image.png` (1200×630): imagen que se muestra al compartir el enlace en WhatsApp, Facebook, LinkedIn y X.
