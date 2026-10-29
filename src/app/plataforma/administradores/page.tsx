import { eq } from "drizzle-orm";
import {
  createPlatformAdminAction,
  grantPlatformAdminAction,
  revokePlatformAdminAction,
  setPlatformAdminActiveAction,
  updatePlatformAdminAction,
} from "@/app/actions/platform";
import { ModalForm } from "@/components/panel/spec-form";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, Notice, PageHeader, Section } from "@/components/ui/primitives";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { listPlatformAdmins } from "@/lib/queries/platform";

export const metadata = { title: "Administradores" };

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ correo?: string; convertido?: string }> }) {
  const me = await requirePlatformAdmin();
  const sp = await searchParams;
  const admins = await listPlatformAdmins();
  const query = (sp.correo ?? "").trim().toLowerCase();
  const found = query
    ? await db.query.users.findFirst({
        where: eq(users.email, query),
        with: { organization: { columns: { name: true, internal: true } } },
      })
    : undefined;

  return (
    <>
      <PageHeader
        title="Administradores"
        description="Quién puede entrar a la Administración de Sobremesa y ver a todos los clientes."
        actions={
          <ModalForm
            action={createPlatformAdminAction}
            title="Agregar administrador"
            triggerLabel="Agregar administrador"
            triggerVariant="primary"
            submitLabel="Agregar"
            description="Entra con este correo y contraseña. Después puede cambiar su contraseña con «Olvidé mi contraseña»."
            fields={[
              { name: "name", label: "Nombre", wide: true },
              { name: "email", label: "Correo", type: "email", wide: true },
              {
                name: "password",
                label: "Contraseña",
                type: "password",
                autoComplete: "new-password",
                hint: "Mínimo 8 caracteres",
                wide: true,
              },
            ]}
          />
        }
      />
      {sp.convertido ? (
        <div className="mb-6">
          <Notice tone="green">Listo: esa cuenta ya entra también a la Administración, con su mismo correo y contraseña.</Notice>
        </div>
      ) : null}

      <ul className="panel divide-y divide-line-soft">
        {admins.map((a) => {
          const isMe = a.id === me.id;
          const internal = a.organization.internal;
          return (
            <li key={a.id} className={`flex flex-wrap items-center gap-3 px-5 py-4 ${a.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {a.name}
                  {a.active ? <Badge tone="green">Activo</Badge> : <Badge tone="red">Desactivado</Badge>}
                  {isMe ? <Badge>Tú</Badge> : null}
                  {internal ? null : <Badge tone="amber">Cuenta de {a.organization.name}</Badge>}
                </p>
                <p className="mt-0.5 text-sm text-ink-soft">{a.email}</p>
                <p className="text-[13px] text-ink-faint">
                  Último acceso: {a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "nunca"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {internal ? (
                  <ModalForm
                    action={updatePlatformAdminAction.bind(null, a.id)}
                    title={`Editar a ${a.name}`}
                    triggerLabel="Editar"
                    triggerSize="sm"
                    submitLabel="Guardar"
                    fields={[
                      { name: "name", label: "Nombre", defaultValue: a.name, wide: true },
                      { name: "email", label: "Correo", type: "email", defaultValue: a.email, wide: true },
                      {
                        name: "password",
                        label: "Nueva contraseña (opcional)",
                        type: "password",
                        autoComplete: "new-password",
                        hint: "Déjala vacía para no cambiarla. Al cambiarla se cierran sus sesiones.",
                        wide: true,
                      },
                    ]}
                  />
                ) : null}
                {isMe ? null : internal ? (
                  <form action={setPlatformAdminActiveAction.bind(null, a.id, !a.active)}>
                    <ConfirmSubmit
                      variant={a.active ? "danger" : "secondary"}
                      size="sm"
                      message={a.active ? `¿Desactivar a ${a.name}? Ya no podrá entrar.` : `¿Reactivar a ${a.name}?`}
                    >
                      {a.active ? "Desactivar" : "Reactivar"}
                    </ConfirmSubmit>
                  </form>
                ) : (
                  <form action={revokePlatformAdminAction.bind(null, a.id)}>
                    <ConfirmSubmit
                      variant="danger"
                      size="sm"
                      message={`¿Quitarle la Administración a ${a.name}? Seguirá entrando al panel de ${a.organization.name}.`}
                    >
                      Quitar acceso
                    </ConfirmSubmit>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Section
        className="mt-12"
        title="Convertir una cuenta de cliente"
        description="Si la persona ya entra como dueño o gerente de un negocio, búscala por su correo para hacerla administrador sin cambiarle el correo ni la contraseña."
      >
        <form className="flex max-w-xl flex-wrap items-end gap-2" role="search">
          <div className="min-w-0 flex-1">
            <label htmlFor="correo" className="label">
              Correo de la cuenta
            </label>
            <input
              id="correo"
              name="correo"
              type="email"
              defaultValue={sp.correo}
              placeholder="dueno@negocio.mx"
              className="input"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar cuenta
          </Button>
        </form>
        {query ? (
          <div className="mt-4 max-w-xl">
            {!found ? (
              <Notice>No hay ninguna cuenta con ese correo.</Notice>
            ) : found.platformAdmin ? (
              <Notice tone="green">{found.name} ya es administrador.</Notice>
            ) : !found.active ? (
              <Notice tone="amber">La cuenta de {found.name} está desactivada en su negocio.</Notice>
            ) : (
              <div className="panel flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{found.name}</p>
                  <p className="text-sm text-ink-soft">
                    {found.email} · {found.role === "ADMIN" ? "Administrador" : "Gerente"} de {found.organization.name}
                  </p>
                </div>
                <form action={grantPlatformAdminAction.bind(null, found.id)}>
                  <ConfirmSubmit message={`¿Hacer a ${found.name} administrador de Sobremesa? Verá a todos los clientes.`}>
                    Hacer administrador
                  </ConfirmSubmit>
                </form>
              </div>
            )}
          </div>
        ) : null}
      </Section>
    </>
  );
}
