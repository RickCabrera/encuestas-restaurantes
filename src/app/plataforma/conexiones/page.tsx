import { sql } from "drizzle-orm";
import { sendTestEmailAction, testDatabaseAction } from "@/app/actions/platform";
import { SpecForm } from "@/components/panel/spec-form";
import { Badge, PageHeader } from "@/components/ui/primitives";
import { db } from "@/db";
import { APP_TIMEZONE } from "@/lib/dates";
import { licenseSigningConfigured } from "@/lib/license-token";
import { appUrl } from "@/lib/request";

export const metadata = { title: "Conexiones" };
export const dynamic = "force-dynamic";

function Vars({ names }: { names: string[] }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
      Variables:
      {names.map((n) => (
        <code key={n} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-ink">
          {n}
        </code>
      ))}
    </p>
  );
}

function Card({
  title,
  status,
  ok,
  children,
}: {
  title: string;
  status: string;
  ok: boolean | "warn";
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <Badge tone={ok === true ? "green" : ok === "warn" ? "amber" : "red"}>{status}</Badge>
      </div>
      <div className="mt-2 max-w-2xl text-[15px] text-ink-soft">{children}</div>
    </section>
  );
}

async function dbInfo() {
  try {
    const [v] = await db.execute<{ server_version: string }>(sql`show server_version`);
    const [m] = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    const [size] = await db.execute<{ size: string }>(sql`select pg_size_pretty(pg_database_size(current_database())) as size`);
    return { ok: true as const, version: v.server_version, migrations: Number(m.n), size: size.size };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

function hostOf(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export default async function ConnectionsPage() {
  const info = await dbInfo();
  const resend = !!process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const sentry = !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN;
  const configuredUrl = process.env.APP_URL?.replace(/\/$/, "");
  const url = await appUrl();
  const secretOk = (process.env.AUTH_SECRET ?? "").length >= 32;

  return (
    <>
      <PageHeader
        title="Conexiones"
        description="Los servicios externos que Sobremesa necesita. Cada uno se configura con variables de entorno en Railway y se aplica al volver a desplegar."
      />
      <div className="space-y-4">
        <Card title="Base de datos" ok={info.ok} status={info.ok ? "PostgreSQL" : "Sin conexión"}>
          {info.ok ? (
            <p>
              PostgreSQL {info.version} en <strong className="text-ink">{hostOf(process.env.DATABASE_URL) ?? "—"}</strong>,{" "}
              {info.size} usados. {info.migrations} migraciones aplicadas; las pendientes se aplican solas en cada despliegue.
            </p>
          ) : (
            <p>No respondió: {info.error}</p>
          )}
          <Vars names={["DATABASE_URL", "DIRECT_DATABASE_URL", "DATABASE_POOL_MAX"]} />
          <div className="mt-4">
            <SpecForm action={testDatabaseAction} fields={[]} submitLabel="Probar conexión" pendingText="Probando…" />
          </div>
        </Card>

        <Card title="Correo saliente" ok={resend ? true : "warn"} status={resend ? "Resend" : "Solo en el log"}>
          <p>
            {resend ? (
              <>
                Los correos salen por Resend con el remitente{" "}
                <strong className="text-ink">{from ?? "Encuestas <onboarding@resend.dev>"}</strong>.
              </>
            ) : (
              <>Sin clave de Resend los correos no se envían: se escriben en el log del servidor.</>
            )}{" "}
            Se usan para recuperar contraseñas, avisar de calificaciones bajas, mandar enlaces de alta y avisar de solicitudes de
            demo. El dominio del remitente debe estar verificado en Resend.
          </p>
          <Vars names={["RESEND_API_KEY", "EMAIL_FROM"]} />
          <div className="mt-4">
            <SpecForm action={sendTestEmailAction} fields={[]} submitLabel="Enviar correo de prueba" pendingText="Enviando…" />
          </div>
        </Card>

        <Card
          title="Licencias de las PCs"
          ok={licenseSigningConfigured()}
          status={licenseSigningConfigured() ? "Firmando" : "Sin llave"}
        >
          <p>
            Las instalaciones en PC (el .exe) se activan con la cuenta del negocio y renuevan aquí su licencia una vez al día.
            {licenseSigningConfigured()
              ? " La llave de firma está configurada."
              : " Falta la llave de firma: sin ella ninguna PC puede activarse ni renovarse."}
          </p>
          <Vars names={["LICENSE_PRIVATE_KEY"]} />
        </Card>

        <Card title="Dirección pública" ok={configuredUrl ? true : "warn"} status={configuredUrl ? "Configurada" : "Sin APP_URL"}>
          <p>
            Es la dirección que llevan los QR impresos y los enlaces de los correos: <strong className="text-ink">{url}</strong>.{" "}
            {configuredUrl
              ? "Si cambias de dominio, actualízala y vuelve a imprimir los QR."
              : "Sin APP_URL se toma de la petición; ponla con el dominio definitivo antes de imprimir QR."}
          </p>
          <Vars names={["APP_URL"]} />
        </Card>

        <Card title="Sesiones" ok={secretOk} status={secretOk ? "Secreto seguro" : "Secreto corto"}>
          <p>
            Las sesiones del panel se firman con un secreto propio y duran {process.env.SESSION_DAYS ?? "7"} días. Cambiar el
            secreto cierra todas las sesiones.
          </p>
          <Vars names={["AUTH_SECRET", "SESSION_DAYS"]} />
        </Card>

        <Card title="Monitoreo de errores" ok={sentry ? true : "warn"} status={sentry ? "Sentry" : "Apagado"}>
          <p>
            {sentry
              ? "Los errores del servidor y del navegador se reportan a Sentry."
              : "Opcional. Con un DSN de Sentry los errores llegan con detalle y alertas al correo."}{" "}
            Para monitorear que el sitio esté arriba usa <code className="font-mono text-[13px]">{url}/api/health</code>.
          </p>
          <Vars names={["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]} />
        </Card>

        <Card title="Zona horaria" ok status={APP_TIMEZONE}>
          <p>Con ella se cuentan los días en los resultados, los cortes de pago y el horario de las tablets.</p>
          <Vars names={["APP_TIMEZONE"]} />
        </Card>
      </div>
    </>
  );
}
