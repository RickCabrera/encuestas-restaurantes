# Sobremesa — Encuestas de experiencia para restaurantes

Sistema para que un grupo de restaurantes cree encuestas de satisfacción por sucursal y consulte los resultados. Los comensales responden en las **tablets del restaurante** (modo kiosko) o desde su celular con un **código QR**.

- **Panel** (`/admin`): restaurantes, encuestas, tablets, usuarios y resultados.
- **Encuesta pública** (`/r/<restaurante>`): la que abre el QR, sin login.
- **Modo tablet** (`/kiosk`): app instalable que se vincula con un código de 6 dígitos, se reinicia sola entre comensales y guarda respuestas sin internet.

La guía de despliegue está en [`docs/DEPLOY.md`](docs/DEPLOY.md), el manual para el cliente en [`docs/MANUAL.md`](docs/MANUAL.md) y el backlog original en [`docs/backlog.md`](docs/backlog.md).

## Stack

| Tema              | Elección                                                        |
| ----------------- | --------------------------------------------------------------- |
| Framework         | Next.js 16 (App Router, Server Actions) + React 19 + TypeScript |
| UI                | Tailwind CSS 4, componentes propios, Recharts, lucide-react     |
| Base de datos     | PostgreSQL 16 (Supabase o Neon en producción)                   |
| ORM / migraciones | Drizzle ORM + drizzle-kit (SQL versionado en `drizzle/`)        |
| Auth              | Sesión propia: JWT HS256 (`jose`) en cookie httpOnly + bcrypt   |
| Validación        | Zod 4 (compartida entre cliente y servidor)                     |
| QR / PDF          | `qrcode` + `pdf-lib`                                            |
| Correo            | API HTTP de Resend (opcional)                                   |
| Errores           | Sentry (opcional, se activa con DSN)                            |
| Pruebas           | Vitest (unitarias + integración con BD) y Playwright (E2E)      |

**Cambios respecto al backlog**, con su motivo:

- **Drizzle en lugar de Prisma.** Drizzle no necesita binarios nativos, así que corre igual en serverless y en cualquier CI. Las migraciones son SQL plano y revisable.
- **Sesión propia en lugar de Auth.js.** Solo se necesitaba correo y contraseña. Con unas 80 líneas quedan la invalidación de sesiones al cambiar contraseña (`sessionVersion`) y los roles, sin dependencia beta.
- **Logos guardados en Postgres (bytea, máx. 512 KB)** en lugar de Supabase Storage o Vercel Blob. Así no hay un servicio externo más que configurar.
- **Rate limiting respaldado en Postgres.** Funciona con varias instancias serverless sin agregar Redis.

## Arranque local

Requisitos: Node 20.9+ (se recomienda 22) y PostgreSQL 14+.

```bash
cp .env.example .env              # ajusta DATABASE_URL y AUTH_SECRET
npm install
npm run db:migrate                # crea las tablas
npm run db:seed:demo              # datos demo con ~200 respuestas (o db:seed sin respuestas)
npm run dev
```

Con el seed quedan estas cuentas y datos:

| Qué                     | Valor                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| Admin                   | `admin@demo.com` / `Admin12345!`                                      |
| Gerente (solo "Centro") | `gerente@demo.com` / `Gerente12345!`                                  |
| PIN de tablets          | `1234`                                                                |
| Encuestas públicas      | http://localhost:3000/r/centro y http://localhost:3000/r/boca-del-rio |
| Modo tablet             | http://localhost:3000/kiosk (el código se genera en Panel → Tablets)  |

## Comandos

| Comando                                                | Qué hace                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `npm run dev`                                          | Servidor de desarrollo                                                                  |
| `npm run build` / `npm start`                          | Build y servidor de producción                                                          |
| `npm run vercel-build`                                 | Migraciones + build (lo usa Vercel)                                                     |
| `npm run lint` / `npm run typecheck`                   | ESLint / TypeScript                                                                     |
| `npm test`                                             | Pruebas unitarias e integración (usa `TEST_DATABASE_URL`, por defecto `encuestas_test`) |
| `npm run test:e2e`                                     | Playwright; levanta su propio servidor contra `encuestas_e2e`                           |
| `npm run db:generate`                                  | Genera una migración nueva tras cambiar `src/db/schema.ts`                              |
| `npm run db:migrate`                                   | Aplica migraciones pendientes                                                           |
| `npm run db:studio`                                    | Explorador visual de la BD                                                              |
| `npm run create-admin -- correo "Nombre" "Contraseña"` | Crea o restablece un administrador                                                      |
| `npm run invite:org`                                   | Imprime un enlace de un solo uso para dar de alta una cadena nueva con su administrador |
| `npm run invite:admin -- "Cadena"`                     | Imprime un enlace de un solo uso para un administrador más en una cadena que ya existe  |
| `npm run org:delete -- "Cadena"`                       | Borra una cadena de prueba con todo lo suyo (pide confirmación; nunca borra "Demo")     |

Para las pruebas locales crea una vez las bases: `createdb encuestas_test && createdb encuestas_e2e`.

## Variables de entorno

Documentadas en [`.env.example`](.env.example). Mínimo para producción: `DATABASE_URL`, `AUTH_SECRET` (32+ caracteres) y `APP_URL`. Opcionales: `DIRECT_DATABASE_URL` (migraciones sin pooler), `RESEND_API_KEY` + `EMAIL_FROM` (correos), `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`, `APP_TIMEZONE` (por defecto `America/Mexico_City`) y `SESSION_DAYS`.

## Arquitectura

```
src/
  app/
    (auth)/            login, recuperar y restablecer contraseña
    admin/             panel (layout con sesión obligatoria)
    r/[slug]/          encuesta pública (QR)
    kiosk/             modo tablet (PWA)
    api/
      responses/       POST de respuestas (QR sin token, tablet con Bearer)
      kiosk/pair       vincula tablet con código de 6 dígitos
      kiosk/config     restaurante + encuesta activa + PIN para la tablet
      qr/[id]          QR en PNG / PDF / PDF por mesa
      export/          CSV
      logo/[id]        logo público del restaurante
      health/          monitor de disponibilidad
    actions/           Server Actions (todas validan sesión y rol)
  components/
    survey/            SurveyRunner: la misma pantalla para QR, tablet y vista previa
    kiosk/             app de tablet, teclado, almacenamiento y cola offline
    results/           filtros, indicadores y gráficas
    ui/                primitivas (botones, campos, modal)
  db/                  esquema Drizzle y conexión
  lib/                 reglas de negocio puras (probadas) y consultas
drizzle/               migraciones SQL
scripts/               migrate, seed, create-admin, create-invite, invite-org, delete-org
tests/                 unit, integration (con BD), e2e (Playwright)
```

### Modelo de datos

`users`, `restaurants`, `user_restaurants` (gerentes ↔ restaurantes), `surveys` (versión y estado `DRAFT | ACTIVE | ARCHIVED`), `questions` (tipo + **indicador**), `devices` (tablets), `responses`, `answers`, `password_reset_tokens` y `rate_limits`.

**Reglas clave:**

- **Una sola encuesta activa por restaurante.** Lo garantiza un índice único parcial en la BD, y al publicar una encuesta la anterior se archiva en la misma transacción.
- **Una encuesta con respuestas no se edita.** Se duplica como nueva versión; así el histórico no se corrompe.
- **Cada pregunta puede alimentar un indicador** (`FOOD`, `SERVICE`, `RECOMMEND`, `FIRST_VISIT`, `CAPTAIN_VISIT`, `COMMENT`). El dashboard agrega por indicador, de modo que los resultados siguen comparables aunque cambien el texto o el orden de las preguntas entre versiones.
- **El id de cada respuesta se genera en el cliente.** El envío es idempotente, así que la cola offline de la tablet puede reintentar sin duplicar.
- **Se marca `low_score`** cuando alguna calificación tiene 2 estrellas o menos, o la recomendación es de 6 o menos. Eso dispara un correo a quienes activaron avisos, mediante `after()` para no retrasar la respuesta.

### Modo tablet

1. El admin agrega una tablet y obtiene un código de 6 dígitos (vence en 15 min).
2. La tablet abre `/kiosk`, escribe el código y recibe un token aleatorio. En el servidor solo se guarda su SHA-256; en la tablet, en `localStorage`.
3. La tablet descarga `/api/kiosk/config` y la guarda en caché. Un service worker cachea la app, así que abre aunque no haya internet.
4. Cada respuesta se guarda primero en una cola local y luego se envía. Si no hay red, se reintenta cada 30 s y al volver la conexión. El comensal nunca ve un error.
5. La configuración se refresca al volver a la pantalla de inicio (máx. 1 vez/min) y cada 30 min, salvo de 00:00 a 07:00 (hora de Ciudad de México). Una encuesta recién publicada entra en el siguiente ciclo, sin reinstalar nada.
6. **Menú del personal:** mantener presionada 3 s la esquina superior izquierda y escribir el PIN. El PIN se valida en la tablet, contra un hash que solo reciben tablets vinculadas, para que funcione sin internet. Tras 5 intentos fallidos, espera de 30 s.
7. **Desvincular desde el panel** invalida el token: la tablet regresa sola a la pantalla de código.

### Seguridad

- Toda Server Action y ruta del panel valida sesión y rol en el servidor. Los gerentes quedan limitados por `restaurantScope`, y hay pruebas de integración para eso.
- Headers: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y `Permissions-Policy` (ver `next.config.ts`).
- Rate limits:
  - Login: 20 intentos por IP y 8 por correo cada 15 min.
  - Respuestas QR: 30 por IP cada 10 min y 5 por IP y encuesta cada 30 min.
  - Tablet: 120 cada 10 min.
  - Vinculación: 10 cada 15 min.
- Anti-spam en la encuesta: honeypot, más un bloqueo de reenvío de 30 min en el mismo navegador.
- CSV: se neutraliza la inyección de fórmulas de Excel. Los textos libres se muestran escapados (React).
- Cambiar o restablecer la contraseña cierra las demás sesiones.

## Pruebas

- **Unitarias** (`tests/unit`): NPS y promedios, validación de respuestas, reglas de edición, esquema del editor, CSV, fechas por zona horaria y que el SHA-256 de la tablet coincida con el del servidor.
- **Integración** (`tests/integration`, con Postgres real):
  - Envío de respuestas: idempotencia, borradores y archivadas, tablets de otro restaurante, cola offline con encuesta archivada y honeypot.
  - Alcance de gerentes, indicadores y rate limit.
- **E2E** (`tests/e2e`):
  - Alta de restaurante → encuesta desde plantilla → publicar → responder → quedar bloqueada para edición.
  - QR por mesa, CSV y QR en PNG/PDF.
  - Tablet completa: vinculación, ciclo, sin internet y sincronización, PIN y desvinculación.
  - Permisos de gerente y login.

El workflow de CI (`.github/workflows/ci.yml`) corre lint, tipos, unitarias e integración, build y E2E contra el build de producción en cada PR.
