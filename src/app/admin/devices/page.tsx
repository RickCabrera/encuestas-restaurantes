import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { devices, restaurants } from "@/db/schema";
import { EmptyState, PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { parseFilters } from "@/lib/filters";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { appUrl } from "@/lib/request";
import { AddDevice, DeviceRowActions } from "./device-actions";

export const metadata = { title: "Tablets" };

function status(d: { tokenHash: string | null; pairingCode: string | null; pairingExpiresAt: Date | null }) {
  if (d.tokenHash) return { label: "Vinculada", tone: "text-basil" };
  if (d.pairingCode && d.pairingExpiresAt && d.pairingExpiresAt > new Date())
    return { label: "Esperando vinculación", tone: "text-[#7a5507]" };
  return { label: "Sin vincular", tone: "text-ink-faint" };
}

function lastSeenLabel(d: Date | null) {
  if (!d) return "Nunca";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return "En línea";
  if (mins < 60) return `Hace ${mins} min`;
  return formatDateTime(d);
}

export default async function DevicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requireAdmin();
  const f = await parseFilters(await searchParams, admin);
  const rs = await listAccessibleRestaurants(admin);
  const rows = await db
    .select({
      id: devices.id,
      name: devices.name,
      tokenHash: devices.tokenHash,
      pairingCode: devices.pairingCode,
      pairingExpiresAt: devices.pairingExpiresAt,
      lastSeenAt: devices.lastSeenAt,
      pairedAt: devices.pairedAt,
      restaurantName: restaurants.name,
    })
    .from(devices)
    .innerJoin(restaurants, eq(restaurants.id, devices.restaurantId))
    .where(and(eq(devices.active, true), f.restaurantId ? eq(devices.restaurantId, f.restaurantId) : undefined))
    .orderBy(asc(restaurants.name), asc(devices.name));
  const kioskUrl = `${await appUrl()}/kiosk`;

  return (
    <>
      <PageHeader
        title="Tablets"
        description={
          <>
            Vincula las tablets o celulares del restaurante. En el equipo abre{" "}
            <span className="font-medium text-ink">{kioskUrl.replace(/^https?:\/\//, "")}</span> y escribe el código de 6 dígitos.
          </>
        }
        actions={<AddDevice restaurants={rs} defaultRestaurant={f.restaurantId} />}
      />
      {rows.length === 0 ? (
        <EmptyState title="Aún no hay tablets" action={<AddDevice restaurants={rs} defaultRestaurant={f.restaurantId} />}>
          Agrega una tablet para obtener su código de vinculación.
        </EmptyState>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Tablet</th>
                <th>Restaurante</th>
                <th>Estado</th>
                <th>Última conexión</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const s = status(d);
                return (
                  <tr key={d.id}>
                    <td className="font-medium">{d.name}</td>
                    <td>{d.restaurantName}</td>
                    <td className={s.tone}>{s.label}</td>
                    <td className="text-ink-soft">{d.tokenHash ? lastSeenLabel(d.lastSeenAt) : "—"}</td>
                    <td className="text-right">
                      <DeviceRowActions id={d.id} name={d.name} paired={!!d.tokenHash} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
