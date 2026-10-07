# Manual de usuario

Este manual es para el dueño y los gerentes de los restaurantes.

## Entrar al panel

Abre `https://encuestas.tudominio.com/admin` y entra con tu correo y contraseña. Si la olvidaste, toca **Olvidé mi contraseña** y te llegará un enlace por correo.

Cada cuenta pertenece a una **cadena** (tu negocio). El nombre de tu cadena aparece arriba en la barra lateral. Todo lo que ves y configuras es solo de tu cadena: sus restaurantes, usuarios, encuestas, tablets y respuestas. Nadie de otra cadena puede verlo.

Hay dos tipos de usuario:

- **Administrador:** configura todo y ve todos los restaurantes de su cadena.
- **Gerente:** solo ve los resultados de los restaurantes que se le asignaron.

Si tu cadena es nueva, el resumen te pedirá **crear tu primer restaurante**. Después crea su encuesta y vincula una tablet o imprime su QR.

Arriba a la izquierda está el **selector de restaurante**. Lo que elijas ahí se aplica al resumen, las respuestas y los comentarios, y se recuerda mientras dure tu sesión.

## Restaurantes

**Configuración → Restaurantes → Agregar restaurante.**

- **Nombre:** como lo verá el comensal.
- **Dirección de la encuesta:** se llena sola a partir del nombre. Es la parte final del enlace y del QR, por ejemplo `/r/centro`. Si la cambias, los QR ya impresos dejan de funcionar.
- **Logo y color principal:** aparecen en la encuesta, en las tablets y en el PDF del QR.
- **PIN:** lo usa el personal para salir del modo tablet.
- **Tiempos:**
  - Cuántos segundos se muestra el "¡Vuelva pronto!".
  - Tras cuántos segundos sin tocar la pantalla se descarta una encuesta a medias.

**Desactivar** un restaurante pausa su encuesta y sus tablets, pero conserva todas las respuestas.

## Encuestas

**Configuración → Encuestas → Nueva encuesta.** Elige el restaurante y empieza con la **plantilla base** (las 6 preguntas que definieron) o en blanco.

En el editor puedes:

- Cambiar el texto de las preguntas, su tipo y si son obligatorias.
- Arrastrar para reordenar (o usar las flechas).
- Agregar preguntas de Sí/No, estrellas (1 a 5), recomendación (0 a 10), opción única o texto libre.
- Elegir el **indicador en el resumen**. Por ejemplo, la pregunta de alimentos alimenta "Calificación de alimentos". Gracias a esto el resumen sigue comparando bien aunque cambies el texto.
- Cambiar el texto de bienvenida y el mensaje final.

Toca **Guardar cambios**, revisa la **Vista previa** (tablet y celular) y luego **Publicar**.

- Cada restaurante tiene **una sola encuesta activa**. Al publicar una nueva, la anterior se archiva.
- Cuando una encuesta ya tiene respuestas **no se puede editar**, para no mezclar resultados. Usa **Duplicar**, edita el borrador y publícalo.
- **Duplicar** también sirve para copiar una encuesta a otros restaurantes de una vez.

## Tablets del restaurante

**Configuración → Tablets → Agregar tablet.** Ponle un nombre (p. ej. "Tablet entrada") y elige el restaurante. Aparece un **código de 6 dígitos** que vence en 15 minutos.

En la tablet:

1. Abre el navegador en `https://encuestas.tudominio.com/kiosk`.
2. Escribe el código y toca **Vincular**.
3. Instálala en la pantalla de inicio para que abra en pantalla completa. Android: menú ⋮ → Instalar app. iPad: Compartir → Agregar a inicio.

Cómo funciona:

- La tablet muestra "Toca para comenzar". El comensal responde y ve el mensaje final. Unos segundos después la tablet vuelve sola al inicio.
- **Si se va el internet, la tablet sigue funcionando.** Guarda las respuestas y las envía cuando regresa la conexión. En la esquina inferior derecha verás cuántas faltan por enviar.
- **Menú del personal:** mantén presionada 3 segundos la esquina superior izquierda y escribe el PIN. Desde ahí puedes actualizar la encuesta, salir de pantalla completa o desvincular la tablet.
- En **Tablets** ves cuándo se conectó cada una por última vez. **Desvincular** hace que la tablet vuelva a pedir código; úsalo si se pierde o se reemplaza. La tablet lo nota sola: al iniciar la siguiente encuesta, al abrir el menú del personal o en su siguiente consulta automática (cada 30 minutos).

### Desvincular esta tablet

Sirve para pasar una tablet a otro restaurante, o a otra cadena, desde la propia tablet:

1. Abre el **menú del personal** (esquina superior izquierda, 3 segundos, PIN) y toca **Desvincular esta tablet**.
2. La tablet intenta enviar primero las respuestas que tenga pendientes. Si no puede (por ejemplo, sin internet), te dice cuántas se perderían; toca **Cancelar** para reintentar más tarde o **Desvincular de todos modos**.
3. Al confirmar, la tablet vuelve a la pantalla **Vincular tablet** y en **Tablets** aparece como "Sin vincular".
4. Para usarla en otro restaurante o cadena: **Tablets → Agregar tablet** en el panel de ese restaurante, y escribe el código en la tablet.

En la app Android la misma opción está también en el "Menú de la app" (ver [TABLET-APK.md](TABLET-APK.md#pasar-la-tablet-a-otro-restaurante-o-cadena)).

## Códigos QR

En la ficha de cada restaurante:

- **Descargar PNG:** para usar en redes o en tus propios diseños.
- **Descargar PDF para imprimir:** una hoja carta con el QR grande.
- **QR por mesa:** elige el rango (p. ej. mesas 1 a 20) y descarga un PDF con 6 tarjetas por hoja. El número de mesa queda guardado en cada respuesta y puedes filtrar por él.

## Resultados

- **Resumen:**
  - Indicadores del periodo: respuestas, promedio de alimentos, atención del mesero, NPS, visita del jefe de mesas y primera visita, comparados contra el periodo anterior.
  - Gráfica diaria o semanal.
  - Comparativo entre restaurantes y comentarios recientes.
- **Respuestas:** cada encuesta enviada. Filtra por fechas, canal (tablet o QR), mesa o solo calificaciones bajas. Toca la fecha para ver el detalle.
- **Comentarios:** quejas, sugerencias y felicitaciones, con buscador. Los marcados en rojo vienen de una calificación baja.
- **Resultados por pregunta:** desde una encuesta, botón **Resultados**. Muestra la distribución de cada respuesta.
- **Exportar CSV:** abre en Excel con una fila por respuesta y una columna por pregunta.

**Qué es el NPS:** en "¿Nos recomendarías?" (0 a 10), quienes ponen 9 o 10 son promotores, de 7 a 8 pasivos y de 0 a 6 detractores. NPS = % promotores − % detractores, de −100 a +100.

## Avisos de calificaciones bajas

En **Mi cuenta** activa "Recibir un correo cuando llegue una calificación baja": 2 estrellas o menos, o recomendación de 6 o menos. El administrador también puede activarlo para cada usuario en **Usuarios**.

## Usuarios

Solo para administradores. **Configuración → Usuarios → Agregar usuario**: nombre, correo, contraseña inicial, rol y, si es gerente, qué restaurantes puede ver. **Desactivar** cierra su sesión de inmediato.

**Invitar con enlace** genera un enlace de un solo uso (vence en 7 días) para que la persona elija su propio correo y contraseña. La cuenta que se crea con ese enlace queda dentro de tu cadena.

## Cadenas: alta y borrado (para quien opera el sistema)

Esta sección no es para dueños ni gerentes: los comandos se corren en una terminal, dentro de la carpeta del proyecto.

### A qué base de datos apuntan los comandos

Los comandos usan la variable de entorno **`DATABASE_URL`**. Si no la defines, toman la de tu archivo `.env`, que es tu base **local**. Para trabajar sobre **producción**, define `DATABASE_URL` en la terminal con la URL directa de la base de producción (la misma que está en Vercel como `DIRECT_DATABASE_URL`) antes de correr el comando. Lo que definas en la terminal tiene prioridad sobre el `.env`.

`invite:org` necesita además **`APP_URL`**, la dirección pública del sistema, porque con ella arma el enlace.

En PowerShell (Windows):

```powershell
$env:DATABASE_URL = "<url directa de producción>"
$env:APP_URL = "https://encuestas.tudominio.com"
```

En bash (Mac o Linux) se ponen delante del comando: `DATABASE_URL="<url directa de producción>" APP_URL="https://encuestas.tudominio.com" npm run invite:org`.

Las variables de PowerShell duran hasta que cierras esa terminal. Ciérrala al terminar para no seguir apuntando a producción sin querer.

### Dar de alta una cadena nueva

```bash
npm run invite:org
```

Imprime un enlace como `https://encuestas.tudominio.com/registro?codigo=…`. Envíaselo al dueño de la cadena nueva.

- Al abrirlo, escribe el **nombre de su cadena o negocio**, su nombre, correo y contraseña. Queda como administrador de esa cadena y entra directo al panel, que estará vacío.
- El enlace sirve **una sola vez** y vence en **7 días**. Cada vez que corres el comando sale un enlace distinto.
- El enlace solo se muestra en la terminal. Si se pierde, genera otro.

### Borrar una cadena de prueba

```bash
npm run org:delete -- "Nombre exacto de la cadena"
```

- Muestra a qué base de datos apunta y cuántos restaurantes, usuarios, encuestas, tablets, respuestas e invitaciones va a borrar.
- Pide escribir otra vez el nombre de la cadena. Si no coincide exactamente, no borra nada.
- Borra todo junto o no borra nada. **No se puede deshacer.**
- La cadena **Demo** nunca se puede borrar.
- Si hay dos cadenas con el mismo nombre, no borra ninguna y muestra el id de cada una. Elige una con `npm run org:delete -- --id <id>`.

El nombre es el que aparece arriba en la barra lateral del panel de esa cadena. Respeta mayúsculas, acentos y espacios.
