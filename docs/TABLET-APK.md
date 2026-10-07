# App Android para las tablets

La app de `android-tablet/` abre el modo tablet (`<servidor>/kiosk`) a pantalla completa. Sirve para dejar una tablet Android dedicada a las encuestas sin depender de Chrome:

- Pantalla siempre encendida, sin barras del sistema y con el botón atrás deshabilitado.
- Recuerda el servidor, la vinculación y las respuestas pendientes entre reinicios.
- Si no logra abrir el servidor muestra "Sin conexión, reintentando" y prueba de nuevo cada 10 segundos.
- Funciona con `https://` y también con `http://` en la red local (la versión instalada en una PC: [INSTALAR-PC.md](INSTALAR-PC.md)).

Requiere Android 7 o posterior. El código de la app web no cambia: la tablet se vincula igual que en el navegador (ver [MANUAL.md](MANUAL.md#tablets-del-restaurante)).

## 1. Preparar la firma (una sola vez)

Android solo deja actualizar una app si el APK nuevo está firmado con la misma llave que el anterior. Esa llave (el keystore) **no se guarda en el repositorio**: vive en GitHub Secrets.

1. Genera el keystore en tu computadora (necesitas Java instalado):

   ```bash
   keytool -genkeypair -v -keystore sobremesa-tablet.jks -alias tablet \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   Te pedirá una contraseña y algunos datos. Si te pregunta por una contraseña distinta para la llave, usa la misma.

2. Conviértelo a texto base64:

   ```bash
   # macOS / Linux / Git Bash
   base64 -w 0 sobremesa-tablet.jks > sobremesa-tablet.jks.b64
   ```

   ```powershell
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("sobremesa-tablet.jks")) | Set-Content sobremesa-tablet.jks.b64
   ```

3. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Crea estos cuatro:

   | Secret                      | Valor                                               |
   | --------------------------- | --------------------------------------------------- |
   | `ANDROID_KEYSTORE_BASE64`   | El contenido completo de `sobremesa-tablet.jks.b64` |
   | `ANDROID_KEYSTORE_PASSWORD` | La contraseña del keystore                          |
   | `ANDROID_KEY_ALIAS`         | `tablet`                                            |
   | `ANDROID_KEY_PASSWORD`      | La contraseña de la llave (normalmente la misma)    |

4. Guarda el archivo `.jks` y su contraseña en un lugar seguro fuera del repositorio (un gestor de contraseñas) y borra el `.b64`.

**Si pierdes el keystore no podrás actualizar la app:** habría que desinstalarla en cada tablet, instalar la nueva y volver a vincular. El `.gitignore` ya ignora `*.jks` y `*.keystore` para que no se suban por accidente.

## 2. Compilar el APK

El workflow **APK tablet** (`.github/workflows/android-apk.yml`) compila el APK firmado y lo sube como artifact. Corre:

- Con cada push a `main` o a `apk-tablet` que cambie `android-tablet/` o el propio workflow.
- Al subir un tag `tablet-v*`. El tag define la versión: `tablet-v1.2.0` produce la versión `1.2.0`.
- A mano, en cualquier rama: **Actions → APK tablet → Run workflow** y elige la rama. GitHub solo muestra este botón cuando el workflow ya existe en la rama por defecto (`main`); mientras no se haya hecho el merge, usa el push a `apk-tablet`.

Para descargarlo: **Actions → APK tablet →** la ejecución más reciente **→ Artifacts**. El zip trae el `.apk` y un `.sha256` para comprobar la descarga. Los artifacts se conservan 90 días.

Si faltan los secrets de firma, el workflow falla y dice cuáles faltan; nunca publica un APK sin firmar.

Cada APK lleva dos números, visibles en la pantalla del servidor y en el menú de la app como `Versión 1.0.0 (37)`:

- **Nombre de versión** (`1.0.0`): viene del tag, o es `1.0.0` si se compiló sin tag.
- **Número de compilación** (`37`): el número de ejecución del workflow. Siempre crece, así que un APK más nuevo se instala encima del anterior.

### Compilar en tu computadora

Con Android Studio (o JDK 17+ y el SDK de Android) instalado:

```bash
cd android-tablet
./gradlew assembleDebug
```

El APK queda en `app/build/outputs/apk/debug/`. Es una compilación de prueba, firmada con una llave distinta: no se puede instalar encima de la versión firmada por el workflow.

## 3. Instalar en la tablet

1. Copia el `.apk` a la tablet (USB, correo o una liga de descarga) y ábrelo. Android pedirá permitir la instalación desde esa fuente: acéptalo.

   Con cable y `adb`: `adb install sobremesa-tablet-1.0.0-37.apk`

2. Abre **Sobremesa Tablet**. La primera vez pide la **Dirección del servidor**:
   - En internet: `https://encuestas.sitirt.mx`
   - En la red local: `http://192.168.1.50:3000`

   Toca **Guardar y conectar**. La app comprueba que la dirección responda (`/api/health`) antes de guardarla; si no responde, dice por qué y no guarda nada. Si escribes la dirección sin `https://` o `http://`, prueba primero la versión segura.

3. La primera vez Android muestra el aviso "Viendo en pantalla completa". Toca **Entendido**; no vuelve a salir.

4. Vincula la tablet: en el panel, **Configuración → Tablets → Agregar tablet**, y escribe en la tablet el código de 6 dígitos.

5. Deja la tablet conectada a la corriente.

### Actualizar

Instala el APK nuevo encima del anterior. Se conservan el servidor, la vinculación y las respuestas pendientes de enviar.

## 4. Uso diario

- **Menú del personal** (el de siempre): esquina superior izquierda, 3 segundos, con el PIN del restaurante. Actualiza la encuesta, envía pendientes o desvincula la tablet.
- **Menú de la app**: mantén presionadas **las dos esquinas superiores a la vez durante 5 segundos** y escribe el PIN del restaurante. Muestra el servidor y la versión, y permite:
  - **Recargar la encuesta**.
  - **Cambiar servidor**: abre la pantalla de dirección con la actual escrita. Si hay respuestas sin enviar, avisa: se quedan guardadas en la tablet, pero solo se envían al volver a la dirección anterior.
  - **Bloquear tablet** / **Desbloquear tablet**: fija la app en pantalla o la suelta (ver [sección 5](#fijar-pantalla-bloquear-tablet)).

  Pon los dos dedos al mismo tiempo. Si dejas uno solo en la esquina izquierda más de 3 segundos se abre el menú del personal; ciérralo e inténtalo otra vez.

  Si la tablet todavía no está vinculada no hay PIN que pedir, y el menú de la app abre directo.

- **Sin conexión.** Con la encuesta ya abierta, la tablet sigue recibiendo respuestas sin internet y las envía cuando vuelve (igual que en el navegador). La pantalla "Sin conexión, reintentando" solo aparece cuando la app no logra abrir el servidor, por ejemplo al encenderla sin red. Desde esa pantalla también funciona el gesto de las dos esquinas, por si la dirección cambió.

  Con un servidor `http://` en red local la tablet no puede arrancar sin red (el navegador solo guarda la página para uso sin conexión cuando la dirección es `https://`). Una vez abierta, sí sigue funcionando si la red se cae.

## 5. Bloquear la tablet (opcional)

La app oculta las barras del sistema, pero Android no deja que una app normal bloquee los botones Inicio y Recientes: deslizando desde el borde de la pantalla reaparecen. Hay tres niveles, de menos a más:

### ¿Qué bloqueo uso?

| Bloqueo                              | Qué impide                                                                                                            | Qué no impide                                                                        | Al reiniciar la tablet                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Solo pantalla de inicio              | Que el botón Inicio saque de la encuesta.                                                                             | Recientes, notificaciones y Ajustes.                                                 | La app abre sola. No hay que hacer nada.                                                   |
| Fijar pantalla (**Bloquear tablet**) | Inicio, Recientes y notificaciones. Con PIN de pantalla y "Pedir PIN para desfijar", salir exige el PIN de la tablet. | Apagar o reiniciar. Sin PIN de pantalla, cualquiera desfija con el gesto de Android. | Se pierde la fijación. La app vuelve a pedirla al abrirse y alguien debe aceptar el aviso. |
| Bloqueo total (device owner)         | Todo lo anterior, sin avisos y sin forma de salir desde la tablet.                                                    | Nada relevante. A cambio exige restablecer la tablet de fábrica para activarlo.      | La app abre sola y queda bloqueada sin que nadie toque nada.                               |

Para una tablet que ya está en uso, lo práctico es **pantalla de inicio + Bloquear tablet + PIN de pantalla**. Para tablets nuevas o que se puedan restablecer, el bloqueo total es el único que no depende de que alguien acepte un aviso.

### Fijar pantalla (Bloquear tablet)

La app puede pedirle a Android que la fije en pantalla, sin restablecer la tablet ni usar una computadora. Mientras está fijada no funcionan Inicio, Recientes ni las notificaciones.

**Preparar la tablet (una sola vez):**

1. **Ponle un PIN de pantalla a la tablet**: **Ajustes → Seguridad → Bloqueo de pantalla → PIN**. Que no sea el PIN del restaurante: ese lo conoce más gente.
2. Activa **Ajustes → Seguridad → Fijar apps** y, dentro, **Pedir PIN para desfijar**. El nombre y el lugar cambian según la marca ("Fijar pantalla", "Fijar ventanas" en Samsung, a veces dentro de "Más ajustes de seguridad"); lo más rápido es buscar "fijar" en Ajustes.
3. Deja la app como pantalla de inicio (ver [abajo](#usarla-como-pantalla-de-inicio)). Sin esto, la app no abre sola al reiniciar la tablet y nadie vuelve a pedir el bloqueo hasta que alguien la abra.

**Activarlo:**

1. Abre el menú de la app (dos esquinas, 5 segundos, PIN del restaurante) y toca **Bloquear tablet**.
2. Android muestra su aviso de que la app quedará fijada. Toca **Entendido** (o **Iniciar**, según la versión).

La app recuerda que la dejaste bloqueada: cada vez que se abre sin estar fijada (después de un reinicio, o si alguien la desfijó) vuelve a mostrar el aviso de Android. Si alguien responde **No, gracias**, la app no insiste; el menú de la app avisa que la pantalla no está fijada y **Bloquear tablet** sigue ahí para reintentar.

**Quitarlo:** menú de la app → **Desbloquear tablet**. Si activaste "Pedir PIN para desfijar", la tablet pasa a su pantalla de bloqueo y pide el PIN de la tablet.

**Límites frente al bloqueo total:**

- **Android siempre pide confirmación.** Una app normal no puede fijarse sola, así que después de cada reinicio alguien del personal tiene que aceptar el aviso.
- **Sin PIN de pantalla casi no protege.** Cualquiera puede desfijar con el gesto de Android (mantener Atrás y Recientes, o deslizar hacia arriba y mantener), y Android mismo muestra cómo hacerlo cuando alguien toca Atrás o Inicio. Con PIN y "Pedir PIN para desfijar", ese gesto solo lleva a la pantalla de bloqueo.
- **Con PIN de pantalla, tras un reinicio la tablet se queda en la pantalla de bloqueo** hasta que alguien escriba el PIN. La encuesta no vuelve sola.
- **El botón de encendido sigue funcionando**: se puede apagar o reiniciar la tablet.
- **Depende de la marca.** Algunas tablets (ciertas Xiaomi, Huawei o Amazon Fire) esconden o quitan esta función. Si la tablet no la permite, la app lo avisa y sigue funcionando sin bloqueo.

Si la tablet es device owner estas opciones no aparecen: ya tiene el bloqueo total.

### Usarla como pantalla de inicio

Presiona el botón Inicio; Android pregunta qué app usar como inicio. Elige **Sobremesa Tablet → Siempre**. Desde entonces el botón Inicio regresa a la encuesta y la app abre sola al encender la tablet.

Para deshacerlo: **Ajustes → Apps → Apps predeterminadas → App de inicio**.

Esto no bloquea Recientes ni las notificaciones: alguien con intención todavía puede llegar a Ajustes. Combínalo con **Bloquear tablet** para cerrar esa puerta.

### Bloqueo total (device owner)

Registrar la app como "propietaria del dispositivo" le permite a Android bloquear de verdad la tablet: sin Inicio, sin Recientes, sin notificaciones, y la app vuelve a abrir sola al reiniciar.

**Antes de hacerlo, toma en cuenta:**

- **Requiere restablecer la tablet de fábrica.** Android solo acepta un device owner en un equipo recién restablecido, así que se borra todo lo que tenga.
- **La tablet no puede tener ninguna cuenta agregada.** Durante la configuración inicial, omite el paso de la cuenta de Google. Si ya agregaste una, el comando falla y hay que restablecer otra vez.
- Mientras la app sea device owner **no se puede desinstalar**. Sí se puede actualizar instalando un APK nuevo encima.
- La tablet queda dedicada a las encuestas. Para usarla en otra cosa hay que quitar el bloqueo (abajo) o restablecerla de fábrica.

Pasos:

1. Restablece la tablet de fábrica y termina la configuración inicial **sin agregar cuenta de Google** (el Wi-Fi sí puedes configurarlo).
2. Activa las opciones de desarrollador (**Ajustes → Acerca de la tablet →** toca 7 veces **Número de compilación**) y dentro de ellas, **Depuración por USB**.
3. Conecta la tablet a una computadora con `adb` y ejecuta:

   ```bash
   adb install sobremesa-tablet-1.0.0-37.apk
   adb shell dpm set-device-owner mx.sitirt.encuestas.tablet/.AdminReceiver
   ```

   Debe responder `Success: Device owner set to package mx.sitirt.encuestas.tablet`. Si dice que ya hay cuentas en el dispositivo, falta el restablecimiento o quedó una cuenta agregada.

4. Abre la app. Desde ese momento queda fija en pantalla y como pantalla de inicio. Configura el servidor y vincula la tablet como en la sección 3.
5. Desactiva la depuración por USB si no la vas a usar.

**Quitar el bloqueo total:** abre el menú de la app (dos esquinas, 5 segundos, PIN) y toca **Quitar el bloqueo total**. La app deja de ser device owner y la tablet vuelve a ser una tablet normal; después ya se puede desinstalar. Para activarlo de nuevo hay que repetir todo el proceso, con restablecimiento incluido. Al quitarlo también se olvida el "Bloquear tablet" que hubiera quedado guardado.

## 6. Problemas comunes

| Síntoma                                                | Qué revisar                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "No se pudo conectar con…" al guardar la dirección     | Que la tablet tenga Wi-Fi, que la dirección esté bien escrita y, en red local, que incluya el puerto (`:3000`) y que la tablet esté en la misma red que el servidor.                                                                                                                                                         |
| "…respondió, pero no es un servidor de encuestas"      | La dirección apunta a otro sitio o a otro puerto. Abre `<dirección>/api/health` en un navegador: debe mostrar `{"status":"ok",…}`.                                                                                                                                                                                           |
| "Sin conexión, reintentando" que no se quita           | El servidor está apagado o cambió de dirección. Mantén las dos esquinas 5 segundos para cambiarla.                                                                                                                                                                                                                           |
| Se abre el menú del personal en vez del menú de la app | Los dos dedos no tocaron a la vez. Cierra el menú e inténtalo de nuevo.                                                                                                                                                                                                                                                      |
| Nadie recuerda el PIN y hay que cambiar el servidor    | Cambia el PIN del restaurante en el panel; la tablet lo toma la siguiente vez que se conecte al servidor actual. Si ese servidor ya no existe, borra los datos de la app (**Ajustes → Apps → Sobremesa Tablet → Almacenamiento → Borrar datos**) y configúrala de nuevo. Se pierden las respuestas que no se habían enviado. |
| "App no instalada" al actualizar                       | El APK está firmado con otra llave (por ejemplo, una compilación de prueba). Usa el APK del workflow.                                                                                                                                                                                                                        |
| El workflow falla en "Comprobar secrets de firma"      | Falta alguno de los cuatro secrets de la sección 1.                                                                                                                                                                                                                                                                          |
| Las barras del sistema reaparecen al deslizar          | Es el comportamiento normal de Android y se ocultan solas. Para impedirlo, usa **Bloquear tablet** o el bloqueo total.                                                                                                                                                                                                       |
| El menú dice que la pantalla no está fijada            | Alguien respondió "No, gracias" al aviso de Android, o la tablet no permite fijar apps. Toca **Bloquear tablet** y acepta el aviso. Si no aparece ningún aviso, revisa que "Fijar apps" exista y esté activado en Ajustes.                                                                                                   |
| Cualquiera puede salir de la app aunque esté bloqueada | Falta el PIN de pantalla o la opción "Pedir PIN para desfijar" (sección 5).                                                                                                                                                                                                                                                  |
| Tras reiniciar, la tablet no vuelve a la encuesta      | Con PIN de pantalla hay que escribirlo primero. Después, la app solo abre sola si es la pantalla de inicio, y alguien debe aceptar el aviso de fijar.                                                                                                                                                                        |
