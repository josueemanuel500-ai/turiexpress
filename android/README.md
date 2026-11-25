# App Android "Turi Panel"

Trusted Web Activity (generada con Bubblewrap) que abre el panel `https://api.turiexpress.com.mx`
a pantalla completa y entrega las notificaciones push como notificaciones nativas de Android.

- Paquete: `mx.com.turiexpress.panel`
- Llave de firma: `D:\TURIEXPRESS\android-firma\` (**no** está en git; respáldala). La huella SHA-256 de la llave
  está publicada por la API en `/.well-known/assetlinks.json` (`server/src/index.ts`).
  Si la llave cambia, hay que actualizar esa huella o la app mostrará la barra del navegador.

## Nueva versión

1. Sube `versionCode` y `versionName` en `app/build.gradle` (y en `twa-manifest.json`).
2. Compila (JDK 17 y Android SDK):

   ```bash
   ./gradlew assembleRelease bundleRelease
   ```

3. Firma `app/build/outputs/apk/release/app-release-unsigned.apk` con `zipalign` + `apksigner`, y el `.aab` con `jarsigner`,
   usando la llave de `android-firma`.
4. Publica la actualización para que aparezca en **Ajustes → Actualización de la app**:
   - copia el APK al servidor en `~/turiexpress/server/downloads/TuriPanel-X.Y.Z.apk` (no va en git);
   - cambia `android.version` y `android.url` en `server/public/version.json` y despliega.

Las notificaciones usan el canal propio "Rentas" (prioridad alta, sonido y vibración), creado en `DelegationService.java`.
Al subir la versión del panel, cambia `APP_VERSION` en `server/public/app.js` y `panel` en `version.json`.

Casi todos los cambios del panel **no** requieren nueva versión: la app carga el panel desde el servidor,
así que basta con desplegar la API.
