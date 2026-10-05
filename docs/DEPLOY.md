# Guía de despliegue (E9)

Todo esto es configuración externa; el código ya está listo. **Todas las cuentas deben quedar a nombre del cliente.**

Arquitectura: una sola app para todas las cadenas y sus restaurantes (Vercel) y una base Postgres administrada (Supabase o Neon). Costo estimado: de $0 a $50 USD al mes.

## 1. Cuentas (US-9.1)

- GitHub: organización o repo del cliente, con el equipo como colaborador.
- Vercel (Hobby para empezar; Pro si el cliente lo usa comercialmente).
- Supabase **o** Neon.
- Sentry (plan gratis).
- Resend, solo si quieren correos de recuperación de contraseña y alertas.

## 2. Base de datos (US-9.2)

Crea dos proyectos: `encuestas-staging` y `encuestas-prod`. En cada uno copia:

- **URL del pooler** (Supabase: "Transaction pooler", puerto 6543; Neon: la URL con `-pooler`) → `DATABASE_URL`
- **URL directa** (puerto 5432 / sin `-pooler`) → `DIRECT_DATABASE_URL`, que usan las migraciones.

Activa los backups diarios: en Supabase vienen en el plan Pro (en Free, descarga manual con `pg_dump`); en Neon, el historial de ramas cubre la restauración a un punto en el tiempo.

## 3. Vercel (US-9.3)

1. **Import Project** → el repo de GitHub. Vercel detecta Next.js.
2. **Build Command:** déjalo vacío. `package.json` trae `vercel-build`, que corre las migraciones y luego el build.
3. **Environment Variables**, por ambiente (Production / Preview):

   | Variable                               | Production                      | Preview (staging) |
   | -------------------------------------- | ------------------------------- | ----------------- |
   | `DATABASE_URL`                         | pooler prod                     | pooler staging    |
   | `DIRECT_DATABASE_URL`                  | directa prod                    | directa staging   |
   | `DATABASE_POOL_MAX`                    | `1`                             | `1`               |
   | `AUTH_SECRET`                          | `openssl rand -base64 32`       | otro distinto     |
   | `APP_URL`                              | `https://encuestas.cliente.com` | URL de staging    |
   | `APP_TIMEZONE`                         | `America/Mexico_City`           | igual             |
   | `RESEND_API_KEY`, `EMAIL_FROM`         | opcional                        | opcional          |
   | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | opcional                        | opcional          |

4. Ramas: `main` → producción. Los PR y `develop` generan previews. Para un staging fijo, asigna un dominio a la rama `develop`.
5. Primer deploy. El sistema es multi-cadena: cada cliente es una cadena con sus propios restaurantes, usuarios y respuestas. La migración crea la cadena "Demo". Para dar de alta a un cliente, genera desde tu máquina, apuntando a producción, un enlace de registro de un solo uso (vence en 7 días) y envíaselo:

   ```bash
   DATABASE_URL="<url directa prod>" APP_URL="https://encuestas.cliente.com" npm run invite:org
   ```

   Con ese enlace el cliente escribe el nombre de su cadena, crea su cuenta y queda como su administrador. Después, él mismo genera más enlaces para su gente desde Usuarios → "Invitar con enlace". No existe registro público: `/registro` solo funciona con un enlace vigente.

   Otros comandos, con las mismas variables:
   - `npm run invite:admin -- "Nombre de la cadena"`: enlace para un administrador más en una cadena que ya existe (sin nombre, la cadena "Demo").
   - `npm run create-admin -- correo@cliente.com "Nombre" "ContraseñaSegura" "Nombre de la cadena"`: crea el administrador directamente, o le restablece la contraseña si ya existe.
   - `npm run org:delete -- "Nombre de la cadena"`: borra una cadena de prueba con todo lo suyo. Ver [MANUAL.md](MANUAL.md#cadenas-alta-y-borrado-para-quien-opera-el-sistema).

   **No corras el seed en producción**: borra todas las tablas.

## 4. Dominio (US-9.4)

En Vercel → Domains, agrega `encuestas.cliente.com` y crea el CNAME que indica en el DNS del cliente. El SSL se emite solo. Verifica que `APP_URL` coincida con el dominio, porque es la URL que llevan los QR.

## 5. Puesta en marcha en restaurantes (US-9.5)

1. En el panel: crea los restaurantes reales (con PIN de tablet), crea su encuesta desde la plantilla y **publícala**.
2. En cada tablet:
   - Abre `https://encuestas.cliente.com/kiosk` en Chrome (Android) o Safari (iPad).
   - En el panel: Tablets → Agregar tablet → escribe el código en la tablet.
   - **Instalar en la pantalla de inicio**. Android: menú ⋮ → "Instalar app"; iPad: Compartir → "Agregar a inicio". Así abre en pantalla completa.
   - Bloquea la tablet en la app:
     - **Android:** Ajustes → Seguridad → Fijar pantalla (o usa un MDM / app de kiosko).
     - **iPad:** Ajustes → Accesibilidad → Acceso guiado, y triple clic al abrir la app.
   - Pon la pantalla para que no se apague y deja la tablet conectada a la corriente.
3. Descarga los QR (PDF general o por mesa) desde la ficha del restaurante e imprímelos.

## 6. Monitoreo (US-9.6)

- **Sentry:** crea un proyecto Next.js, pon los DSN en Vercel y configura las alertas al correo del equipo.
- **UptimeRobot** (u otro): monitor HTTP cada 5 min a `https://encuestas.cliente.com/api/health`. Responde 200 si la BD está bien y 503 si no.
- **Logs:** Vercel → Logs. Los eventos importantes salen en JSON (`response.saved`, `auth.login_failed`, `device.paired`, etc.).

## Alternativa: VPS con Docker

Si el cliente prefiere un servidor propio, usa un Node 22, `npm ci && npm run db:migrate && npm run build && npm start` detrás de nginx con TLS (Let's Encrypt), y Postgres administrado o en el mismo servidor con `pg_dump` diario por cron. Las mismas variables de entorno aplican.
