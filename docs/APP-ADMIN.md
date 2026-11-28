# App de administradores (Android y iPhone/iPad)

La app abre el panel (`https://cuentanos.com.mx/admin`) a pantalla completa, para dueños y gerentes. Es la misma página web del panel: todo lo que cambie en la web aparece en la app sin publicar una versión nueva.

|                       | Android                                          | iPhone / iPad                   |
| --------------------- | ------------------------------------------------ | ------------------------------- |
| Código                | `android-admin/` (Kotlin, sin bibliotecas)       | `ios-admin/` (Swift + XcodeGen) |
| Identificador         | `mx.sitirt.encuestas.admin`                      | `mx.sitirt.encuestas.admin`     |
| Nombre en el teléfono | Cuéntanos Admin                                  | Cuéntanos Admin                 |
| Mínimo                | Android 8                                        | iOS 16                          |
| Workflow              | **App admin Android**                            | **App admin iOS**               |
| Resultado             | `.apk` (instalar directo) y `.aab` (Google Play) | `.ipa` (App Store / TestFlight) |

Qué hace la app además de mostrar el panel:

- **Sesión guardada**: no hay que iniciar sesión cada vez (dura lo que dure la sesión del panel).
- **Descargas**: QR en PNG, PDF de mesas y CSV de respuestas. En Android van a _Descargas_; en iPhone se abre la hoja de compartir (guardar en Archivos, imprimir, WhatsApp…).
- **Subir el logo** desde la galería o la cámara.
- **Pantalla "Sin conexión"** con botón para reintentar. En iPhone, además, jalar hacia abajo recarga.
- **Enlaces**: las páginas del panel se quedan en la app; la encuesta del comensal (`/r/...`), el sitio público y otros sitios se abren en el navegador; correo, teléfono y WhatsApp en su app.
- Botón/gesto **atrás** navega dentro del panel.
- La app se identifica en el _user agent_ como `CuentanosAdmin/<versión> (Android|iOS)`.

## Compilar

Los dos workflows corren solos con cada push a `main` que cambie su carpeta, y también:

- **A mano**: Actions → _App admin Android_ / _App admin iOS_ → **Run workflow**. Tiene una casilla para subir a la tienda (Play: prueba interna; Apple: TestFlight).
- **Con un tag `admin-vX.Y.Z`** (p. ej. `admin-v1.0.0`): compila las dos con esa versión **y las sube a las tiendas** (si están los secrets).

```bash
git tag admin-v1.0.0 && git push origin admin-v1.0.0
```

Para descargar: Actions → el workflow → la ejecución → **Artifacts**. Se guardan 90 días.

Versiones: el nombre (`1.0.0`) sale del tag, o es `1.0.<número de corrida>` sin tag. El número de compilación es el número de corrida del workflow, así que siempre crece (las dos tiendas rechazan números repetidos).

## Android: Google Play

### Firma

La app usa **la misma llave que la app de tablets** (secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; ver [TABLET-APK.md](TABLET-APK.md)). No hay que crear nada nuevo. En Google Play esa llave es la **llave de subida**: Google guarda aparte la llave con la que firma lo que instalan los usuarios (Play App Signing).

### Publicar por primera vez (manual, una sola vez)

1. En [Play Console](https://play.google.com/console): **Crear app** → nombre _Cuéntanos Admin_, idioma español (México), app, gratis.
2. Descarga el `.aab` del último artifact de _App admin Android_ y súbelo en **Pruebas → Prueba interna → Crear versión**. Play pide aceptar _Play App Signing_: acéptalo.
3. Llena la ficha de la tienda y los formularios de **Contenido de la app** (ver [Datos para las fichas](#datos-para-las-fichas)).
4. **Cuenta para revisión**: en _Acceso a la app_ elige "Toda o parte de la funcionalidad está restringida" y da un usuario y contraseña de prueba (ver [Cuenta de revisión](#cuenta-de-revisión)).
5. Cuentas de desarrollador **personales** nuevas: Google pide una prueba cerrada con al menos 12 personas durante 14 días antes de pasar a producción. Las cuentas de **organización** no tienen ese requisito.

### Subidas automáticas (opcional)

Para que el workflow suba solo el `.aab` a _prueba interna_ (como borrador):

1. En Google Cloud, crea una cuenta de servicio y descarga su llave JSON.
2. En Play Console → **Usuarios y permisos** → invita el correo de la cuenta de servicio con permiso de _Publicar versiones_ para esta app.
3. Crea el secret `PLAY_SERVICE_ACCOUNT_JSON` con el contenido completo del JSON.

La app tiene que existir ya en Play (paso anterior): la API no puede crear apps.

## iPhone / iPad: App Store

### Qué se necesita de la cuenta de Apple (una sola vez)

1. **Team ID**: [developer.apple.com/account](https://developer.apple.com/account) → _Membership details_.
2. **Crear la app en App Store Connect**: _Apps_ → **+** → _Nueva app_ → iOS, nombre _Cuéntanos Admin_, idioma español (México), ID de paquete `mx.sitirt.encuestas.admin` (si no aparece en la lista, regístralo en _Certificates, IDs & Profiles → Identifiers_), SKU `cuentanos-admin`.
3. **Llave de la API**: App Store Connect → _Usuarios y acceso_ → _Integraciones_ → _App Store Connect API_ → **Generar llave** con rol **Admin** (lo necesita para crear y renovar el certificado de distribución automáticamente). Descarga el `.p8` (solo se puede una vez) y anota el **Key ID** y el **Issuer ID**.

### Secrets en GitHub

Settings → Secrets and variables → Actions → New repository secret:

| Secret              | Valor                                                         |
| ------------------- | ------------------------------------------------------------- |
| `APPLE_TEAM_ID`     | El Team ID (10 caracteres)                                    |
| `ASC_KEY_ID`        | El Key ID de la llave                                         |
| `ASC_ISSUER_ID`     | El Issuer ID                                                  |
| `ASC_KEY_P8_BASE64` | El `.p8` en base64: `base64 -i AuthKey_XXXX.p8 \| tr -d '\n'` |

Con eso el workflow firma solo (firma administrada por Apple: no hay que exportar certificados ni perfiles), deja el `.ipa` como artifact y, con tag o con la casilla, lo sube a TestFlight. Sin esos secrets el workflow igual corre las pruebas y compila (sin firmar), para saber que el código está bien.

### Enviar a revisión

1. Tras subir, el build aparece en TestFlight en unos minutos (procesándose). Ahí se puede instalar en iPhones de prueba con la app TestFlight.
2. En la ficha de la versión: elige el build, capturas, descripción, **información para la revisión** con la cuenta de revisión, y **Enviar a revisión**.

## Datos para las fichas

- **Categoría**: Empresa (Business). **Precio**: gratis.
- **Descripción corta**: "Resultados de tus encuestas, comentarios y puntos de tus comensales."
- **Privacidad (Apple) / Seguridad de los datos (Google)**: la app recoge el **correo y nombre** del usuario del panel (para la cuenta) y **datos de uso** del panel; no rastrea ni comparte con terceros; los datos van cifrados (HTTPS). Los datos de los comensales (respuestas y celulares del programa de puntos) los guarda el servidor, no la app.
- **URL de política de privacidad**: `https://cuentanos.com.mx/privacidad`.
- **Clasificación de contenido**: sin contenido sensible (apto para todos).
- **Capturas**: celular (6.9" en Apple, teléfono en Google) y tablet (iPad 13"). Sirven las del panel con datos demo: Resumen, Respuestas, Comentarios y Puntos.

### Cuenta de revisión

Los revisores necesitan entrar. Crea una cadena de demostración con datos de ejemplo y un usuario solo para ellos (p. ej. `revision@cuentanos.com.mx`), y pon usuario y contraseña en las notas de revisión de ambas tiendas. No uses la cuenta de un cliente real.

## Riesgos conocidos en la revisión de Apple

- **Guía 4.2 (funcionalidad mínima)**: Apple a veces rechaza apps que "solo muestran un sitio web". Esta app agrega cosas nativas (descargas con hoja de compartir, cámara para el logo, pantalla sin conexión, jalar para recargar) y es una herramienta de trabajo con cuenta, lo que suele pasar; si la rechazan, lo siguiente sería agregar **notificaciones push** de calificaciones bajas.
- **Guía 5.1.1(v) (borrar cuenta)**: resuelto. En _Mi cuenta → Eliminar cuenta_ cualquier usuario borra su cuenta con su contraseña (el único administrador de una cadena con más personas primero tiene que nombrar a otro). Menciónalo en las notas de revisión.

## Compilar en tu computadora

Android (Android Studio o JDK 17+ con el SDK):

```bash
cd android-admin && ./gradlew assembleDebug
# Otro servidor (p. ej. pruebas): ADMIN_SERVER_URL=https://staging.ejemplo.com ./gradlew assembleDebug
```

iOS (Mac con Xcode 26):

```bash
brew install xcodegen
cd ios-admin && xcodegen generate && open CuentanosAdmin.xcodeproj
```

Para apuntar a otro servidor cambia `CUENTANOS_SERVER_URL` en `ios-admin/project.yml`.
