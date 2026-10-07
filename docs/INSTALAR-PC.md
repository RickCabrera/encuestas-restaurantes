# Instalar en una PC del restaurante (Windows)

`SobremesaEncuestas-Setup-X.Y.Z.exe` instala el sistema completo en una PC con Windows: la aplicación, su base de datos PostgreSQL y los respaldos. Las tablets y el panel se conectan a esa PC por la red local, en `http://IP-de-la-PC:3000`. No necesita internet para funcionar.

Es una alternativa a la versión en la nube ([DEPLOY.md](DEPLOY.md)), que no cambia.

## Antes de decidir: qué cambia respecto a la nube

- **Todo vive en la red del restaurante.** El panel solo se abre desde equipos conectados a esa red, no desde casa.
- **Los QR de mesa solo sirven si el teléfono del comensal está en el Wi-Fi del restaurante.** Las tablets no tienen ese problema.
- **No hay correo.** No llegan las alertas de calificación baja ni el correo de "olvidé mi contraseña". La contraseña de un administrador se restablece desde la PC (ver [Accesos directos](#accesos-directos)).
- **La conexión es `http`, sin cifrar.** Las contraseñas viajan en claro dentro de la red local. Usa una red con contraseña que no sea la de invitados.
- **La PC es el servidor.** Si está apagada, las tablets no pueden enviar respuestas (las guardan y las envían cuando vuelve) y una tablet que se reinicie no puede abrir la encuesta hasta que la PC responda.

## Requisitos

- Windows 10 (versión 1809 o posterior) o Windows 11, de 64 bits.
- Una cuenta con permisos de administrador.
- 2 GB libres en disco.
- La PC conectada a la red del restaurante (cable de preferencia) y encendida mientras el restaurante esté abierto.
- El puerto 3000 libre. Si otro programa lo usa, el instalador avisa y dice cuál.

## 1. Conseguir el instalador

En GitHub: **Actions → Instalador PC → la corrida más reciente → Artifacts**. Descarga `SobremesaEncuestas-Setup-X.Y.Z` y descomprime el `.zip`: trae el `Setup.exe` y un archivo `.sha256`.

El workflow corre con cada cambio en `installer/` y también con **Run workflow**. Para una versión con número propio, crea un tag: `git tag pc-v1.2.0 && git push origin pc-v1.2.0` genera `SobremesaEncuestas-Setup-1.2.0.exe`. Sin tag, la versión es `1.0.<número de corrida>`.

Antes de entregar el instalador, el workflow lo prueba en una máquina limpia: instala, actualiza encima, respalda, restaura, desinstala y reinstala.

Para comprobar que el archivo no se dañó al copiarlo, compara el resultado de este comando con el contenido del `.sha256`:

```powershell
Get-FileHash .\SobremesaEncuestas-Setup-1.2.0.exe -Algorithm SHA256
```

## 2. Instalar

1. Copia el `Setup.exe` a la PC y ábrelo con doble clic.
2. **Aviso de SmartScreen.** Windows muestra "Windows protegió su PC" porque el instalador no tiene firma de código (un certificado de pago). Toca **Más información** y luego **Ejecutar de todas formas**. Si el botón no aparece, haz clic derecho en el archivo → **Propiedades** → marca **Desbloquear** → **Aceptar**, y ábrelo otra vez. Algún antivirus puede pedir una confirmación parecida.
3. Acepta el aviso de permisos de administrador y sigue el asistente. La configuración tarda de uno a tres minutos.
4. La última pantalla trae marcadas dos casillas. Déjalas así y toca **Finalizar**:
   - **Abrir Sobremesa Encuestas** abre el sistema en su propia ventana. La primera vez te lleva directo a crear tu cadena y tu usuario maestro: escribes el nombre de la cadena, tu nombre, tu correo y una contraseña. No hay que copiar ningún enlace.
   - **Ver los datos de la instalación** abre la página **Listo**, con la dirección para las tablets.

El instalador deja el icono **Sobremesa Encuestas** en el Escritorio y en el menú Inicio (ver [Abrir el sistema](#abrir-el-sistema)).

Lo que hace el instalador:

- Crea la base de datos y sus tablas. No carga datos de ejemplo.
- Genera en esa PC un secreto de sesiones y una contraseña de base aleatorios, y los guarda en `C:\ProgramData\SobremesaEncuestas\.env`.
- Registra dos servicios de Windows que arrancan solos al encender la PC.
- Abre el puerto 3000 en el firewall de Windows, solo para redes privadas.
- Programa un respaldo diario de la base.
- Desactiva la suspensión de la PC cuando está conectada a la corriente (ver [Suspensión](#suspensión-de-la-pc)).

### La página "Listo"

Muestra la versión instalada y:

1. **La IP de la PC** en la red local.
2. **La dirección que se escribe en las tablets**, por ejemplo `http://192.168.1.50:3000`. Es también la dirección del panel desde otros equipos de la red. Hay un botón para copiarla, y el panel la repite en **Configuración → Tablets**.
3. **El botón grande "Crear mi cadena"**, mientras no exista ningún usuario: abre el registro con todo listo. Debajo, en chico, queda el enlace de un solo uso (vence en 7 días) por si prefieres crear la cadena desde otro equipo de la red. Cuando ya hay usuarios, el botón dice **Abrir Sobremesa Encuestas**.

La página solo la pueden leer los administradores de Windows; por eso se abre en una ventana propia y no en el navegador. Para verla de nuevo: menú Inicio → **Sobremesa Encuestas → Datos de la instalación (Listo)**.

El panel muestra la versión instalada al pie del menú lateral.

## Abrir el sistema

Doble clic en **Sobremesa Encuestas**, en el Escritorio o en el menú Inicio. No pide permisos de administrador.

- Se abre en una ventana propia, sin pestañas ni barra de direcciones (usa Microsoft Edge; si la PC no tiene Edge, abre el navegador predeterminado).
- Si todavía no hay ningún usuario, lleva a crear la cadena y el usuario maestro. Si ya hay, a iniciar sesión.
- Si la PC se acaba de encender y el sistema aún está arrancando, muestra **Iniciando…** y espera. Si los servicios estaban detenidos, los arranca. Si en minuto y medio no responde, lo dice y ofrece reintentar.
- La sesión es por dirección: entrar en esta ventana (`localhost`) no deja la sesión abierta en `http://IP-de-la-PC:3000`, ni al revés. Cada equipo inicia sesión una vez.

## 3. Poner la red como "Privada"

Windows suele marcar una red nueva como **Pública**, y en una red pública el firewall bloquea a las tablets aunque el sistema esté bien instalado. Si la página "Listo" muestra ese aviso, cámbiala:

**Windows 11**

1. **Configuración → Red e Internet**.
2. Con Wi-Fi: **Wi-Fi → Propiedades de (el nombre de tu red)**. Con cable: **Ethernet**.
3. En **Tipo de perfil de red** elige **Red privada**.

**Windows 10**

1. **Configuración → Red e Internet → Estado**.
2. Debajo del nombre de la red, **Propiedades**.
3. En **Perfil de red** elige **Privado**.

O desde PowerShell como administrador (cambia `Wi-Fi` por el nombre de tu conexión, que aparece con `Get-NetConnectionProfile`):

```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

Para confirmar que ya funciona, abre `http://IP-de-la-PC:3000/api/health` en el navegador de una tablet o de un teléfono conectado al mismo Wi-Fi. Debe responder `{"status":"ok", ...}`.

## 4. Fijar la IP en el router

Las tablets y los QR guardan la IP de la PC. Si el router le da otra IP a la PC, dejan de funcionar. Por eso hay que **reservarla** en el router (una sola vez):

1. En la PC abre **Símbolo del sistema** y escribe `ipconfig /all`. De la conexión que estás usando anota:
   - **Dirección física** (la MAC), por ejemplo `A4-5E-60-12-34-56`.
   - **Dirección IPv4**, la misma que muestra la página "Listo".
   - **Puerta de enlace predeterminada**, por ejemplo `192.168.1.1`: es la dirección del router.
2. En un navegador abre la dirección del router (`http://192.168.1.1`) y entra con su usuario y contraseña. Suelen estar en una etiqueta del propio router.
3. Busca la sección de **DHCP**. Según la marca se llama **Reserva de direcciones**, **Address Reservation**, **DHCP estático**, **Static Lease** o **Asignación de IP fija**.
4. Agrega una reserva con la MAC y la IP que anotaste. Guarda.
5. Reinicia la PC y revisa que la página "Listo" siga mostrando la misma IP.

Si la PC usa cable y Wi-Fi, reserva la conexión que va a usar siempre (de preferencia el cable) y desconecta la otra: cada una tiene su propia MAC y su propia IP.

Si no tienes acceso al router, la alternativa es poner una IP fija en Windows (**Configuración → Red e Internet → (tu conexión) → Asignación de IP → Editar → Manual**), con una dirección fuera del rango que reparte el router. Hazlo solo si sabes cuál es ese rango: una IP repetida en la red da fallas intermitentes.

## 5. Conectar las tablets

Instala la app de tablets ([TABLET-APK.md](TABLET-APK.md)) y en **Dirección del servidor** escribe la dirección para las tablets, con todo y `http://` y `:3000`. Está en la página "Listo" y en el panel, arriba de **Configuración → Tablets**, con un botón para copiarla. La app ya permite conexiones `http` en la red local. Después vincula cada tablet desde el panel: **Configuración → Tablets → Agregar tablet**.

## Si la IP de la PC cambia

Pasa cuando no se reservó la IP, se cambió el router o la PC se conectó por otra tarjeta de red. Las tablets muestran "Sin conexión, reintentando" y los QR dejan de abrir.

**Lo más fácil es devolverle a la PC la IP anterior**: resérvala en el router ([sección 4](#4-fijar-la-ip-en-el-router)) con la IP vieja y reinicia la PC. No hay que tocar nada más.

Si no se puede y la PC se queda con una IP nueva:

1. En la PC: menú Inicio → **Sobremesa Encuestas → Actualizar la IP**. Muestra la dirección anterior y la nueva, y pide confirmar. Reinicia la aplicación.
2. **Antes de cambiar cada tablet**, mira si tiene respuestas sin enviar (el aviso "N por enviar" en la esquina). Esas respuestas están ligadas a la dirección anterior y **no se pueden recuperar con la dirección nueva**. Si las hay, lo mejor es recuperar la IP anterior.
3. En cada tablet: mantén presionadas las dos esquinas superiores 5 segundos, escribe el PIN, toca **Cambiar servidor** y escribe la dirección nueva.
4. Vuelve a vincular cada tablet (**Tablets → Agregar tablet**): con otra dirección, la tablet se comporta como recién instalada.
5. Vuelve a imprimir los QR de mesa: los anteriores llevan la IP vieja.
6. Reserva la IP nueva en el router para que no se repita.

## Actualizar a una versión nueva

Descarga el `Setup.exe` nuevo y ábrelo en la misma PC, encima de la instalación existente. No desinstales antes.

El instalador:

1. Detiene la aplicación y la base.
2. Reemplaza los archivos del programa.
3. Hace un respaldo de seguridad (`backups\antes-de-actualizar-…dump`; conserva los tres más recientes).
4. Aplica solo las migraciones pendientes de la base.
5. Arranca todo de nuevo.

**Nunca vuelve a crear la base ni cambia el `.env`.** Se conservan los usuarios, las encuestas, las respuestas, las tablets vinculadas y las sesiones abiertas. Las tablets no necesitan ningún cambio; durante el minuto que dura, guardan las respuestas y las envían después.

Si la actualización falla, el mensaje indica la bitácora (`C:\ProgramData\SobremesaEncuestas\logs\instalacion.log`). Los datos no se tocan; corrige el problema y vuelve a ejecutar el instalador. Si el respaldo de seguridad no se puede hacer, la actualización se detiene antes de aplicar migraciones.

## Respaldos

Todos los días a las 5:00 (o al encender la PC, si a esa hora estaba apagada) se guarda una copia de la base en:

```
C:\ProgramData\SobremesaEncuestas\backups\encuestas-AAAAMMDD-HHMMSS.dump
```

Se conservan las 14 más recientes. La carpeta solo la pueden abrir los administradores de Windows.

**Los respaldos están en el mismo disco que la base.** Si el disco falla, se pierden los dos. Cada semana copia la carpeta `backups` a una USB o a una nube (OneDrive, Google Drive).

Para hacer un respaldo en el momento, en PowerShell como administrador:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\Sobremesa Encuestas\tools\backup.ps1"
```

### Restaurar un respaldo

Reemplaza el contenido actual de la base por el del respaldo. En PowerShell como administrador:

```powershell
$programa = "C:\Program Files\Sobremesa Encuestas"
$datos = "C:\ProgramData\SobremesaEncuestas"
$respaldo = "$datos\backups\encuestas-AAAAMMDD-HHMMSS.dump"   # el archivo que quieres restaurar

$cfg = @{}
Get-Content "$datos\.env" | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.*)$') { $cfg[$Matches[1]] = $Matches[2] } }

Stop-Service SobremesaEncuestasApp
$env:PGPASSWORD = $cfg['LOCAL_DB_PASSWORD']
& "$programa\pgsql\bin\pg_restore.exe" -h 127.0.0.1 -p $cfg['LOCAL_DB_PORT'] -U $cfg['LOCAL_DB_USER'] -d $cfg['LOCAL_DB_NAME'] --clean --if-exists --no-owner --exit-on-error $respaldo
$env:PGPASSWORD = $null
Start-Service SobremesaEncuestasApp
```

### Mudarse a otra PC

1. Copia a una USB el respaldo más reciente de la PC vieja.
2. Instala Sobremesa Encuestas en la PC nueva.
3. Restaura el respaldo con los pasos de arriba.
4. Dale a la PC nueva la IP de la vieja (reserva en el router) y apaga la vieja. Así las tablets y los QR siguen funcionando sin cambios.

Los usuarios tendrán que iniciar sesión otra vez; las tablets siguen vinculadas.

## Accesos directos

En el menú Inicio, carpeta **Sobremesa Encuestas**. El primero es el de todos los días y no pide permisos; los demás son de mantenimiento y piden permisos de administrador de Windows.

| Acceso directo                              | Para qué                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sobremesa Encuestas**                     | Abre el sistema en su propia ventana. También está en el Escritorio. Ver [Abrir el sistema](#abrir-el-sistema).                                |
| **Datos de la instalación (Listo)**         | La página "Listo": versión, IP, dirección para las tablets, avisos y el botón para crear la cadena.                                            |
| **Generar enlace de alta nuevo**            | Crea otro enlace de un solo uso para dar de alta una cadena con su usuario maestro. Úsalo si el primero venció o ya se usó.                    |
| **Restablecer contraseña de administrador** | Lista a los administradores del panel, pide el correo y la contraseña nueva (mínimo 8 caracteres). Cierra las sesiones abiertas de esa cuenta. |
| **Actualizar la IP**                        | Pone en el sistema la IP actual de la PC. Ver [Si la IP de la PC cambia](#si-la-ip-de-la-pc-cambia).                                           |

Para una contraseña olvidada de un gerente (no administrador), un administrador se la cambia desde el panel: **Usuarios**.

## Suspensión de la PC

Si la PC se duerme, las tablets se quedan sin servidor. Al instalar se desactivan la suspensión y la hibernación automáticas **con corriente** (no con batería). El valor anterior queda guardado y **se restaura al desinstalar**.

No cambia lo que hacen el botón de encendido ni cerrar la tapa de una laptop. Si es una laptop, revísalo en **Panel de control → Opciones de energía → Elegir el comportamiento del cierre de la tapa** y pon "No hacer nada" con corriente.

Para verlo o cambiarlo a mano: **Configuración → Sistema → Energía → Pantalla y suspensión**.

## Desinstalar

**Configuración → Aplicaciones → Sobremesa Encuestas → Desinstalar.** Pregunta si quieres **conservar los datos**:

- **Sí** (recomendado): quita el programa, los servicios, la regla del firewall y el respaldo programado, pero deja la base, el `.env` y los respaldos en `C:\ProgramData\SobremesaEncuestas`. Si vuelves a instalar, todo sigue ahí.
- **No**: pide una segunda confirmación y borra todo, incluidas las respuestas y los respaldos. No se puede deshacer.

En los dos casos se restaura la suspensión de la PC.

## Dónde está cada cosa

| Qué                                   | Dónde                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Programa (se reemplaza al actualizar) | `C:\Program Files\Sobremesa Encuestas\`                                                                           |
| Configuración y secretos de la PC     | `C:\ProgramData\SobremesaEncuestas\.env`                                                                          |
| Base de datos                         | `C:\ProgramData\SobremesaEncuestas\pgdata\`                                                                       |
| Respaldos                             | `C:\ProgramData\SobremesaEncuestas\backups\`                                                                      |
| Bitácoras                             | `C:\ProgramData\SobremesaEncuestas\logs\` (`instalacion.log`, `respaldo.log`, las de cada servicio y `postgres\`) |
| Servicio de la aplicación             | `SobremesaEncuestasApp`, puerto 3000, cuenta `LocalService`                                                       |
| Servicio de la base                   | `SobremesaEncuestasDB`, cuenta `NetworkService`                                                                   |
| Respaldo diario                       | Programador de tareas → `Sobremesa Encuestas - Respaldo diario`                                                   |
| Regla del firewall                    | `Sobremesa Encuestas (puerto 3000)`, entrada, TCP 3000, perfil privado                                            |
| Llave del acceso directo              | `C:\ProgramData\SobremesaEncuestas\publico\llave-inicio.txt` (la leen los usuarios de la PC)                      |

Seguridad:

- PostgreSQL solo acepta conexiones desde la propia PC (`127.0.0.1`), con contraseña, y usa el puerto 5433 (o el siguiente libre) para no chocar con otro PostgreSQL instalado. El puerto elegido queda en el `.env`.
- Ningún servicio corre como administrador ni como `LocalSystem`.
- El `.env`, los respaldos y la página "Listo" solo los leen los administradores de Windows y `SYSTEM`; el `.env`, además, la cuenta del servicio de la aplicación. **No copies el `.env` a otra PC ni lo compartas.**
- Los usuarios de la PC que no son administradores pueden **arrancar** los dos servicios (para que el acceso directo los levante si están detenidos), pero no detenerlos ni cambiarlos.
- El acceso directo entra por la dirección `/inicio`, que es la que decide si toca crear la cadena o iniciar sesión. Solo responde a la propia PC (no desde la red) y con una llave aleatoria guardada en ella. Mientras no exista ningún usuario, **cualquier persona con sesión de Windows en esa PC puede crear la cuenta maestra**: crea la tuya al terminar de instalar.

## Problemas comunes

| Síntoma                                                                             | Qué revisar                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La tablet dice "No se pudo conectar con…" al guardar la dirección                   | Que esté en el mismo Wi-Fi que la PC, que la dirección lleve `http://` y `:3000`, y que la red de la PC esté como **Privada** ([sección 3](#3-poner-la-red-como-privada)). Algunos routers aíslan el Wi-Fi de invitados: no lo uses para las tablets. |
| Funcionaba y de pronto todas las tablets dicen "Sin conexión"                       | Que la PC esté encendida y despierta. Luego, que su IP no haya cambiado: abre **Datos de la instalación (Listo)**, que avisa si cambió.                                                                                                               |
| El icono se queda en "Iniciando…" o dice "No se pudo iniciar"                       | Reinicia la PC. Si sigue, en **Servicios** de Windows `Sobremesa Encuestas - Base de datos` y `Sobremesa Encuestas - Aplicación` deben estar "En ejecución": inícialos en ese orden y revisa las bitácoras.                                           |
| Entré en la PC y en otro equipo me vuelve a pedir contraseña                        | Es normal: la sesión es por dirección (`localhost` en la PC, `http://IP:3000` en los demás).                                                                                                                                                          |
| El instalador avisa que el puerto 3000 está ocupado                                 | Cierra o desinstala el programa que indica el aviso y vuelve a instalar.                                                                                                                                                                              |
| "Los archivos se copiaron, pero la configuración no terminó"                        | Abre `C:\ProgramData\SobremesaEncuestas\logs\instalacion.log`: la última línea con `ERROR` dice el motivo. Vuelve a ejecutar el instalador después de corregirlo; retoma donde se quedó.                                                              |
| Olvidé la contraseña del administrador                                              | Acceso directo **Restablecer contraseña de administrador**.                                                                                                                                                                                           |
| El botón "Copiar" o la instalación como app (PWA) no funcionan igual que en la nube | Es por usar `http`. "Copiar" sí funciona; instalar la página como app y abrirla sin red, no. En las tablets usa la app Android.                                                                                                                       |

## Para quien mantiene el instalador

- Todo está en `installer/`. `installer\build.ps1 -Version 1.2.0` arma el paquete y, si Inno Setup 6 está instalado, el `Setup.exe` en `installer\build\out`. Con `-SkipSetup` solo arma el paquete; no instala nada en la PC donde corre.
- El acceso directo es `SobremesaEncuestas.exe`, un programa pequeño (`installer/launcher/Launcher.cs`) que `build.ps1` compila con el `csc.exe` que trae Windows; no agrega dependencias. El icono es `installer/assets/sobremesa.ico` (se regenera con `make-icon.ps1`).
- `npm run test:e2e:local` prueba el paquete ya armado (`build.ps1 -SkipSetup`) por `localhost` y por la IP de la red: login, cookie de sesión, sección Tablets y `/inicio`. No instala nada; usa la base de E2E.
- `installer\smoke-test.ps1` **sí instala** servicios y PostgreSQL: es para el runner de GitHub Actions, no para una PC de trabajo.
- Las versiones de Node, PostgreSQL y WinSW, con su SHA-256, están en `installer/versions.json`. Para subir una versión menor cambia la URL y el hash.
- **No subas la versión mayor de PostgreSQL** (17 → 18) solo cambiando `versions.json`: la carpeta `pgdata` de las PCs instaladas es de la 17 y el instalador se niega a tocarla. Requiere un paso de migración (respaldo, base nueva y restauración).
- La versión instalable se compila con `APP_MODE=local`. Lo que cambia respecto a la nube está en `src/lib/app-mode.ts` y `next.config.ts`: cookie de sesión sin `secure`, sin HSTS, sin pausa nocturna de las tablets y salida `standalone`. Solo en ese modo existen la ruta `/inicio` y el recuadro "Dirección para las tablets" de la sección Tablets. El servicio arranca la app con `local-server.cjs`, que pone en `x-forwarded-for` la IP real de cada conexión.
- No cambies el `AppId` de `installer/setup.iss` ni los nombres de los servicios: son lo que permite actualizar encima.
