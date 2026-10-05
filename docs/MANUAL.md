# Manual de usuario

Este manual es para el dueño y los gerentes de los restaurantes.

## Entrar al panel

Abre `https://encuestas.tudominio.com/admin` y entra con tu correo y contraseña. Si la olvidaste, toca **Olvidé mi contraseña** y te llegará un enlace por correo.

Hay dos tipos de usuario:

- **Administrador:** configura todo y ve todos los restaurantes.
- **Gerente:** solo ve los resultados de los restaurantes que se le asignaron.

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
- En **Tablets** ves cuándo se conectó cada una por última vez. **Desvincular** hace que la tablet vuelva a pedir código; úsalo si se pierde o se reemplaza.

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
