# Backlog — Sistema de Encuestas de Experiencia para Restaurantes

> Versión 1.0 · 30-sep-2026
> Alcance: MVP end to end (panel del cliente + pantalla de encuesta para comensales)

---

## 1. Contexto y objetivo

El cliente es dueño de **varios restaurantes**. Necesita:

1. **Panel administrativo** para crear encuestas por restaurante y consultar sus respuestas.
2. **Pantalla de encuesta** donde los comensales responden.
   - **Canal principal:** tablets o celulares **del restaurante** en modo kiosko.
   - **Canal adicional:** QR que abre la encuesta en el celular del comensal.

Es un sistema sencillo y de tamaño corto. Se prioriza la simplicidad, sin sobreingeniería.

---

## 2. Decisiones técnicas

| Tema          | Decisión                                                     |
| ------------- | ------------------------------------------------------------ |
| Arquitectura  | Una sola app multi-restaurante (un deploy para todos)        |
| Framework     | Next.js (App Router) + TypeScript                            |
| UI            | Tailwind CSS + shadcn/ui                                     |
| Base de datos | PostgreSQL administrado (Supabase o Neon)                    |
| ORM           | Prisma                                                       |
| Auth (panel)  | Auth.js (credenciales email + contraseña, hash bcrypt)       |
| Validación    | Zod (compartida entre front y back)                          |
| Gráficas      | Recharts                                                     |
| Exportación   | CSV (server-side)                                            |
| QR            | Librería `qrcode` (generación server-side, descarga PNG/PDF) |
| Kiosko        | PWA instalable + modo pantalla completa                      |
| Tests         | Vitest (unit) + Playwright (E2E)                             |
| Errores       | Sentry                                                       |
| Hosting       | Vercel (alternativa: VPS con Docker)                         |
| CI/CD         | GitHub Actions + deploy automático de Vercel                 |

---

## 3. Roles

| Rol                               | Descripción                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| **Admin (dueño)**                 | Gestiona restaurantes, encuestas, dispositivos, usuarios y ve todos los resultados |
| **Gerente de sucursal** _(Could)_ | Solo ve resultados de su(s) restaurante(s) asignados                               |
| **Comensal**                      | Responde la encuesta y no requiere login                                           |

---

## 4. Modelo de datos (borrador)

```
User            id, name, email, passwordHash, role (ADMIN|MANAGER), createdAt
Restaurant      id, name, slug (único), address?, logoUrl?, active, createdAt
UserRestaurant  userId, restaurantId          (para gerentes)
Survey          id, restaurantId, title, welcomeText, closingText ("¡Vuelva pronto! 🙂"),
                status (DRAFT|ACTIVE|ARCHIVED), version, createdAt, publishedAt
Question        id, surveyId, order, type, text, required, options(json)?
                type: YES_NO | RATING_5 | NPS_10 | SINGLE_CHOICE | TEXT
Device          id, restaurantId, name ("Tablet entrada"), tokenHash, lastSeenAt, active
Response        id, surveyId, restaurantId, channel (KIOSK|QR), deviceId?, tableRef?,
                submittedAt, durationSec, clientFingerprint?
Answer          id, responseId, questionId, valueNumber?, valueBool?, valueText?
```

**Reglas clave**

- Solo **una encuesta ACTIVA por restaurante** a la vez.
- Una encuesta con respuestas **no se edita**: se duplica como nueva versión, para no corromper el histórico.
- Las respuestas guardan `restaurantId` y `channel` para filtrar.

---

## 5. Encuesta base (plantilla precargada)

| #   | Pregunta                                                     | Tipo                 | Obligatoria |
| --- | ------------------------------------------------------------ | -------------------- | ----------- |
| 1   | ¿Es primera vez que nos visitan?                             | YES_NO               | Sí          |
| 2   | ¿Qué calificación le das a nuestros alimentos?               | RATING_5 (estrellas) | Sí          |
| 3   | ¿Un jefe de mesas visitó su mesa?                            | YES_NO               | Sí          |
| 4   | ¿Cómo fue la atención del mesero(a)?                         | RATING_5 (estrellas) | Sí          |
| 5   | ¿Nos recomendarías?                                          | NPS_10 (0–10)        | Sí          |
| 6   | ¿Alguna queja, sugerencia o felicitación que quiera agregar? | TEXT                 | No          |
| —   | **Cierre:** ¡Vuelva pronto! 🙂                               | Mensaje final        | —           |

> Confirmar con el cliente si "¿Nos recomendarías?" es Sí/No o escala 0–10 (NPS). Por defecto se usa NPS porque da una métrica estándar.

---

## 6. Épicas

| ID  | Épica                                              | Prioridad |
| --- | -------------------------------------------------- | --------- |
| E0  | Setup del proyecto y fundamentos                   | Must      |
| E1  | Autenticación y usuarios                           | Must      |
| E2  | Gestión de restaurantes                            | Must      |
| E3  | Constructor de encuestas                           | Must      |
| E4  | Pantalla de encuesta (comensal)                    | Must      |
| E5  | Modo kiosko (tablets del restaurante)              | Must      |
| E6  | Canal QR                                           | Should    |
| E7  | Resultados y reportes                              | Must      |
| E8  | Calidad, seguridad y observabilidad                | Must      |
| E9  | Deploy e infraestructura _(configuración externa)_ | Must      |
| E10 | Documentación y entrega                            | Must      |

Estimación en **story points (SP)**: 1 = trivial, 2 = pocas horas, 3 = ~1 día, 5 = 2–3 días, 8 = ~1 semana.

---

## E0 — Setup del proyecto y fundamentos

**US-0.1 · Inicializar repositorio** · 2 SP · Must
Como equipo, quiero un repo base configurado para empezar a desarrollar.

- [ ] Next.js + TypeScript + Tailwind + shadcn/ui
- [ ] ESLint + Prettier + husky (pre-commit)
- [ ] Estructura de carpetas: `app/(admin)`, `app/(public)`, `lib`, `components`, `prisma`
- [ ] `.env.example` documentado

**US-0.2 · Base de datos y ORM** · 3 SP · Must

- [ ] Prisma configurado con el modelo de la sección 4
- [ ] Migración inicial
- [ ] Script `seed` con: 1 admin, 2 restaurantes demo y la encuesta base activa

**US-0.3 · Layout base y sistema de diseño** · 3 SP · Must

- [ ] Layout del panel (sidebar + header + selector de restaurante)
- [ ] Layout público minimalista y responsivo (tablet/celular)
- [ ] Tema con colores y logo configurables

**US-0.4 · CI básico** · 2 SP · Must

- [ ] GitHub Actions: lint, type-check, tests unitarios y build en cada PR

---

## E1 — Autenticación y usuarios

**US-1.1 · Login del panel** · 3 SP · Must
Como admin, quiero iniciar sesión con email y contraseña para acceder al panel.

- [ ] Formulario de login con validación
- [ ] Contraseñas con hash bcrypt
- [ ] Sesión segura (cookie httpOnly)
- [ ] Rutas `/admin/**` protegidas por middleware
- [ ] Límite de intentos de login (rate limit)

**US-1.2 · Logout y expiración de sesión** · 1 SP · Must

- [ ] Botón de cerrar sesión
- [ ] Expiración configurable (ej. 7 días)

**US-1.3 · Cambio y recuperación de contraseña** · 3 SP · Should

- [ ] Cambio de contraseña desde el perfil
- [ ] Recuperación por email con token de un solo uso (requiere proveedor de email, ej. Resend)

**US-1.4 · Gestión de usuarios gerentes** · 3 SP · Could
Como admin, quiero crear gerentes con acceso solo a ciertos restaurantes.

- [ ] CRUD de usuarios con rol MANAGER
- [ ] Asignación de restaurantes
- [ ] El gerente solo ve resultados de sus restaurantes (validado en backend)

---

## E2 — Gestión de restaurantes

**US-2.1 · CRUD de restaurantes** · 3 SP · Must
Como admin, quiero dar de alta mis restaurantes para asignarles encuestas.

- [ ] Crear, editar, desactivar (sin borrado físico si hay respuestas)
- [ ] Campos: nombre, slug autogenerado y editable (único), dirección opcional
- [ ] Listado con estado y encuesta activa

**US-2.2 · Logo por restaurante** · 2 SP · Should

- [ ] Subir logo (almacenamiento: Supabase Storage / Vercel Blob)
- [ ] El logo se muestra en la pantalla de encuesta

**US-2.3 · Selector de restaurante en el panel** · 2 SP · Must

- [ ] Filtro global "Todos / Restaurante X" persistente en la sesión

---

## E3 — Constructor de encuestas

**US-3.1 · Crear encuesta desde plantilla** · 3 SP · Must
Como admin, quiero crear una encuesta para un restaurante partiendo de la plantilla base.

- [ ] Botón "Nueva encuesta" → elegir restaurante → se precargan las preguntas de la sección 5
- [ ] Opción de empezar en blanco

**US-3.2 · Editar preguntas** · 5 SP · Must

- [ ] Agregar, editar y eliminar preguntas
- [ ] Tipos: Sí/No, Estrellas 1–5, NPS 0–10, Opción única, Texto libre
- [ ] Marcar como obligatoria
- [ ] Reordenar con drag & drop
- [ ] Editar texto de bienvenida y de cierre ("¡Vuelva pronto! 🙂")

**US-3.3 · Vista previa** · 2 SP · Must

- [ ] Previsualizar la encuesta tal como la verá el comensal (vista tablet y celular)

**US-3.4 · Publicar / archivar** · 3 SP · Must

- [ ] Estados: Borrador → Activa → Archivada
- [ ] Al activar una, la anterior del mismo restaurante pasa a Archivada (con confirmación)
- [ ] Una encuesta con respuestas no se edita; se ofrece "Duplicar como nueva versión"

**US-3.5 · Duplicar encuesta a otros restaurantes** · 2 SP · Should

- [ ] Copiar una encuesta a uno o varios restaurantes en un paso

---

## E4 — Pantalla de encuesta (comensal)

Base común para kiosko y QR. Ruta pública: `/r/[slug]`.

**US-4.1 · Responder encuesta** · 5 SP · Must
Como comensal, quiero responder la encuesta de forma rápida y clara.

- [ ] Carga la encuesta ACTIVA del restaurante
- [ ] Una pregunta por pantalla con barra de progreso (optimizado para tacto)
- [ ] Controles grandes: botones Sí/No, estrellas, escala 0–10, textarea
- [ ] Botón "Atrás" para corregir
- [ ] Validación de obligatorias
- [ ] Sin login

**US-4.2 · Envío y confirmación** · 3 SP · Must

- [ ] Envío en una sola transacción (Response + Answers)
- [ ] Validación server-side con Zod contra la versión de la encuesta
- [ ] Pantalla final con mensaje de cierre ("¡Vuelva pronto! 🙂")
- [ ] Guarda `channel`, `deviceId` o `tableRef` si aplica, y duración

**US-4.3 · Estados vacíos y errores** · 2 SP · Must

- [ ] Restaurante inexistente o inactivo → mensaje amable
- [ ] Sin encuesta activa → "Encuesta no disponible"
- [ ] Error de red → reintento sin perder respuestas

**US-4.4 · Accesibilidad y responsividad** · 2 SP · Must

- [ ] Funciona en tablet (horizontal y vertical) y celular
- [ ] Contraste AA, tamaños táctiles ≥ 44px, navegable con teclado

**US-4.5 · Anti-spam básico** · 2 SP · Must

- [ ] Rate limit por IP / dispositivo en el endpoint de envío
- [ ] Honeypot invisible
- [ ] (QR) Evitar reenvíos repetidos desde el mismo navegador en una ventana de tiempo

---

## E5 — Modo kiosko (tablets del restaurante) — canal principal

**US-5.1 · Registro de dispositivo** · 5 SP · Must
Como admin, quiero vincular una tablet a un restaurante sin que el personal tenga que iniciar sesión en el panel.

- [ ] En el panel: "Agregar dispositivo" → nombre + restaurante → genera un **código de vinculación** de 6 dígitos (vigencia 15 min)
- [ ] En la tablet: abrir `/kiosk` → ingresar código → el dispositivo queda vinculado con un token persistente (cookie/localStorage)
- [ ] Listado de dispositivos con último uso (`lastSeenAt`) y opción de revocar

**US-5.2 · Ciclo de kiosko** · 3 SP · Must
Como restaurante, quiero que la tablet quede lista para el siguiente comensal automáticamente.

- [ ] Pantalla de bienvenida ("Toca para comenzar") con logo
- [ ] Al terminar, muestra el cierre por X segundos y regresa a la bienvenida
- [ ] Si alguien abandona a medias: tras N segundos de inactividad, se descarta y vuelve al inicio
- [ ] Tiempos configurables por restaurante

**US-5.3 · Salida protegida por PIN** · 2 SP · Must

- [ ] Para salir del modo kiosko o cambiar configuración se requiere un PIN definido en el panel
- [ ] Gesto oculto (ej. mantener presionada una esquina 3 s) para abrir el diálogo de PIN

**US-5.4 · PWA y pantalla completa** · 3 SP · Must

- [ ] Manifest + service worker, instalable en Android/iPad
- [ ] Arranca en pantalla completa en `/kiosk`
- [ ] Evita zoom, selección de texto y "pull to refresh"
- [ ] Mantener la pantalla encendida (Wake Lock API cuando esté disponible)

**US-5.5 · Tolerancia a fallas de internet** · 5 SP · Should

- [ ] La encuesta activa queda en caché en la tablet
- [ ] Si no hay conexión, las respuestas se guardan localmente en cola y se sincronizan al volver la red
- [ ] Indicador discreto de "pendientes por sincronizar"
- [ ] Envío idempotente (ID de respuesta generado en el cliente) para evitar duplicados

**US-5.6 · Actualización de encuesta en caliente** · 2 SP · Should

- [ ] Si el admin publica una nueva versión, la tablet la toma en el siguiente ciclo sin reinstalar

---

## E6 — Canal QR (adicional)

**US-6.1 · Generar QR por restaurante** · 2 SP · Should

- [ ] En el panel: botón "Descargar QR" (PNG y PDF listo para imprimir con logo y texto "Califica tu experiencia")
- [ ] El QR apunta a `/r/[slug]?c=qr`

**US-6.2 · QR por mesa (opcional)** · 3 SP · Could

- [ ] Generar lote de QRs numerados por mesa (`?mesa=12`)
- [ ] Descarga como PDF con varias tarjetas por hoja
- [ ] El número de mesa se guarda en `tableRef` y se puede filtrar en resultados

---

## E7 — Resultados y reportes

**US-7.1 · Dashboard general** · 5 SP · Must
Como admin, quiero ver de un vistazo cómo va la experiencia en mis restaurantes.

- [ ] KPIs: total de respuestas, promedio de alimentos, promedio de atención del mesero, % visita del jefe de mesas, % primera visita, NPS
- [ ] Filtros: restaurante, rango de fechas, canal (kiosko/QR)
- [ ] Tendencia en el tiempo (gráfica por día/semana)
- [ ] Comparativo entre restaurantes (tabla/ranking)

**US-7.2 · Resultados por pregunta** · 3 SP · Must

- [ ] Sí/No → gráfica de pastel/barras con %
- [ ] Estrellas → distribución 1–5 + promedio
- [ ] NPS → promotores, pasivos, detractores + score
- [ ] Texto → lista paginada con búsqueda

**US-7.3 · Listado de respuestas individuales** · 3 SP · Must

- [ ] Tabla paginada con fecha, restaurante, canal, dispositivo/mesa y calificaciones
- [ ] Ver detalle completo de una respuesta

**US-7.4 · Comentarios destacados** · 2 SP · Should

- [ ] Vista dedicada a quejas, sugerencias y felicitaciones con filtro por calificación baja (≤ 2 estrellas o NPS ≤ 6)

**US-7.5 · Exportar a CSV** · 2 SP · Must

- [ ] Exporta respuestas filtradas (una fila por respuesta, una columna por pregunta)
- [ ] Compatible con Excel (UTF-8 con BOM)

**US-7.6 · Alerta de calificación baja** · 3 SP · Could

- [ ] Email al admin/gerente cuando entra una respuesta con calificación baja o comentario de queja

---

## E8 — Calidad, seguridad y observabilidad

**US-8.1 · Autorización en backend** · 2 SP · Must

- [ ] Toda ruta y server action del panel valida sesión y rol
- [ ] Un gerente no puede leer datos de restaurantes no asignados (tests incluidos)

**US-8.2 · Tests unitarios** · 3 SP · Must

- [ ] Validaciones Zod, cálculo de NPS/promedios, reglas de publicación de encuestas

**US-8.3 · Tests E2E** · 5 SP · Must

- [ ] Flujo: login → crear restaurante → crear encuesta → publicar
- [ ] Flujo: vincular tablet → responder en kiosko → ver respuesta en dashboard
- [ ] Flujo: responder vía QR
- [ ] Flujo offline de kiosko (si se implementa US-5.5)

**US-8.4 · Seguridad** · 2 SP · Must

- [ ] Headers de seguridad (CSP, HSTS, X-Frame-Options)
- [ ] Sanitización de texto libre al mostrarlo
- [ ] Secretos solo en variables de entorno

**US-8.5 · Observabilidad** · 1 SP · Must

- [ ] Integración de Sentry (front y back)
- [ ] Logs estructurados en el endpoint de envío

**US-8.6 · Privacidad** · 1 SP · Should

- [ ] Aviso de privacidad breve en la pantalla de encuesta (no se piden datos personales)

---

## E9 — Deploy e infraestructura _(configuración externa, no toca código)_

> Todas las cuentas **a nombre del cliente**.

**US-9.1 · Cuentas y accesos** · 1 SP · Must

- [ ] GitHub (org/repo), Vercel, Supabase/Neon, Sentry, proveedor de email (si aplica)
- [ ] Accesos del equipo como colaboradores

**US-9.2 · Base de datos** · 2 SP · Must

- [ ] Proyecto Postgres para staging y otro para producción
- [ ] Backups diarios automáticos activados
- [ ] Variables `DATABASE_URL` configuradas por ambiente

**US-9.3 · Hosting y CI/CD** · 2 SP · Must

- [ ] Proyecto en Vercel conectado al repo
- [ ] `main` → producción, `develop`/PRs → preview/staging
- [ ] Variables de entorno por ambiente
- [ ] Migraciones de Prisma en el pipeline de deploy

**US-9.4 · Dominio y SSL** · 1 SP · Must

- [ ] Subdominio del cliente (ej. `encuestas.cliente.com`) apuntando a Vercel
- [ ] SSL automático verificado

**US-9.5 · Puesta en marcha en restaurantes** · 2 SP · Must

- [ ] Crear usuario admin real y restaurantes reales en producción
- [ ] Instalar la PWA en cada tablet y vincularla con código
- [ ] Configurar la tablet en modo kiosko del sistema (Android: fijar pantalla / iPad: Acceso Guiado)
- [ ] Imprimir y colocar QRs

**US-9.6 · Monitoreo** · 1 SP · Must

- [ ] Alertas de Sentry al email del equipo
- [ ] Uptime monitor (ej. UptimeRobot) sobre `/api/health`

---

## E10 — Documentación y entrega

**US-10.1 · README técnico** · 2 SP · Must

- [ ] Setup local, variables de entorno, comandos, arquitectura y modelo de datos

**US-10.2 · Manual de usuario** · 2 SP · Must

- [ ] Panel: crear restaurante, crear encuesta, publicar, ver resultados, exportar
- [ ] Tablet: instalar, vincular, salir con PIN
- [ ] QR: descargar e imprimir

**US-10.3 · Entrega y capacitación** · 1 SP · Must

- [ ] Sesión de capacitación con el cliente
- [ ] Transferencia de accesos y periodo de garantía acordado

---

## 7. Resumen de estimación

| Épica           | SP Must | SP Should/Could |
| --------------- | ------- | --------------- |
| E0 Setup        | 10      | —               |
| E1 Auth         | 4       | 6               |
| E2 Restaurantes | 5       | 2               |
| E3 Constructor  | 13      | 2               |
| E4 Encuesta     | 14      | —               |
| E5 Kiosko       | 13      | 7               |
| E6 QR           | —       | 5               |
| E7 Resultados   | 13      | 5               |
| E8 Calidad      | 13      | 1               |
| E9 Deploy       | 9       | —               |
| E10 Entrega     | 5       | —               |
| **Total**       | **99**  | **28**          |

**Referencia:** 1 dev full-stack senior ≈ 20–25 SP/semana → **MVP (Must) en ~4–5 semanas**, con todo en ~6 semanas.

---

## 8. Plan de sprints sugerido (1 semana c/u)

| Sprint | Contenido                                                          |
| ------ | ------------------------------------------------------------------ |
| S1     | E0 completo, E1 (login), E2 (CRUD restaurantes)                    |
| S2     | E3 constructor de encuestas + plantilla base                       |
| S3     | E4 pantalla de encuesta + E6 QR                                    |
| S4     | E5 modo kiosko (vinculación, ciclo, PIN, PWA)                      |
| S5     | E7 resultados, dashboard y CSV                                     |
| S6     | E8 tests/seguridad, E9 deploy, E10 entrega, Should/Could restantes |

---

## 9. Definition of Done

- Código revisado (PR) y en `main`
- Lint, type-check y tests pasando en CI
- Criterios de aceptación cumplidos
- Probado en tablet y celular
- Sin errores nuevos en Sentry en staging

---

## 10. Pendientes por confirmar con el cliente

1. ¿"¿Nos recomendarías?" es Sí/No o escala 0–10 (NPS)?
2. ¿Estrellas 1–5 para alimentos y atención, o caritas?
3. ¿Quieren capturar el nombre del mesero o número de mesa desde la tablet?
4. ¿Necesitan gerentes por sucursal con acceso limitado?
5. ¿Alertas por email ante calificaciones bajas?
6. ¿Qué tablets usan (Android / iPad) y qué tan estable es el internet en los restaurantes?
7. ¿Idioma único (español) o también inglés?
