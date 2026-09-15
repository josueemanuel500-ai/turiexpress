# TURI EXPRESS MX

Sitio estático para solicitar la renta de Nissan Urvan mediante WhatsApp.

## Publicación

El sitio no requiere compilación: `index.html` es el punto de entrada. Para desplegarlo con GitHub Pages, selecciona la rama `main` y la carpeta raíz en la configuración del repositorio.

## Configuración antes de publicar

Edita `WHATSAPP_NUMBER` en `app.js` con el número real del negocio: código de país + número, sin `+`, espacios ni guiones. Ejemplo para México: `5213312345678`.

Las solicitudes abren WhatsApp; no se guardan datos de clientes en el sitio.
