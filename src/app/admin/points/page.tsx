import { and, gt, inArray } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { restaurants } from "@/db/schema";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Badge, EmptyState, Notice, PageHeader, Section, Stat } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { parseFilters } from "@/lib/filters";
import { getLoyaltyOverview, getMember, listRewards } from "@/lib/loyalty";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import type { LoyaltyKind } from "@/db/schema";
import { AdjustForm, RedeemForm } from "./points-forms";

export const metadata = { title: "Puntos" };

const n = (v: number) => v.toLocaleString("es-MX");

const KIND: Record<LoyaltyKind, { label: string; tone: "green" | "amber" | "neutral" }> = {
  EARN: { label: "Encuesta", tone: "green" },
  REDEEM: { label: "Canje", tone: "amber" },
  ADJUST: { label: "Ajuste", tone: "neutral" },
};

function SearchForm({ value }: { value?: string }) {
  return (
    <form method="get" action="/admin/points" className="flex flex-wrap items-end gap-3" role="search">
      <label className="text-sm">
        <span className="mb-1 block text-ink-soft">Celular del comensal</span>
        <input
          name="tel"
          type="tel"
          inputMode="numeric"
          defaultValue={value}
          placeholder="55 1234 5678"
          className="input w-56 tabular-nums"
          autoComplete="off"
          required
        />
      </label>
      <button type="submit" className={buttonClass()}>
        Buscar
      </button>
    </form>
  );
}

export default async function PointsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isAdmin = user.role === "ADMIN";
  const f = await parseFilters(sp, user);
  const rs = await listAccessibleRestaurants(user);
  const enabled =
    user.restaurantIds.length === 0
      ? []
      : await db
          .select({ id: restaurants.id })
          .from(restaurants)
          .where(and(inArray(restaurants.id, user.restaurantIds), gt(restaurants.loyaltyPoints, 0)));

  const tel = sp.tel?.trim();
  const phone = tel ? normalizePhone(tel) : null;

  const header = (
    <PageHeader
      title="Puntos"
      description="Los comensales ganan puntos al contestar la encuesta dejando su celular, y los canjean por premios en cualquier sucursal de la cadena."
      actions={
        isAdmin ? (
          <ButtonLink href="/admin/points/config" variant="secondary">
            Premios y configuración
          </ButtonLink>
        ) : null
      }
    />
  );

  const setupNotice =
    enabled.length === 0 ? (
      <div className="mb-6">
        <Notice tone="amber">
          {isAdmin ? (
            <>
              Ninguna sucursal da puntos todavía.{" "}
              <Link href="/admin/points/config" className="link">
                Configura los puntos por encuesta
              </Link>{" "}
              para que la encuesta empiece a pedir el celular.
            </>
          ) : (
            "Tus sucursales todavía no dan puntos. Pídele a un administrador que lo active."
          )}
        </Notice>
      </div>
    ) : null;

  // ---------- Ficha de un celular ----------
  if (tel) {
    const member = phone ? await getMember(user, phone) : null;
    const rewards = member ? await listRewards(user.organizationId, { activeOnly: true }) : [];
    return (
      <>
        {header}
        <div className="mb-8">
          <SearchForm value={tel} />
        </div>
        {!phone ? (
          <Notice tone="red">Ese número no parece un celular válido. Escríbelo a 10 dígitos.</Notice>
        ) : !member || member.history.length === 0 ? (
          <EmptyState title={`Sin puntos para ${formatPhone(phone)}`}>
            Este celular todavía no ha ganado puntos en la cadena. Los gana al contestar la encuesta y escribir su número al
            final.
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat value={n(member.balance)} label={`Puntos disponibles · ${formatPhone(member.phone)}`} tone="green" />
              <Stat value={n(member.earned)} label="Puntos ganados en total" />
              <Stat value={n(member.visits)} label="Encuestas con puntos" />
              <Stat value={n(member.redemptions)} label="Canjes" />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <Section
                title="Canjear premio"
                description="Descuenta los puntos del premio y regístralo en la sucursal."
                className="mt-0"
              >
                <div className="panel p-5">
                  {rewards.length === 0 ? (
                    <p className="text-sm text-ink-soft">
                      No hay premios activos.{" "}
                      {isAdmin ? (
                        <Link href="/admin/points/config" className="link">
                          Agrega premios al catálogo
                        </Link>
                      ) : (
                        "Pídele a un administrador que agregue premios."
                      )}
                    </p>
                  ) : (
                    <RedeemForm
                      phone={member.phone}
                      balance={member.balance}
                      rewards={rewards.map((r) => ({ id: r.id, name: r.name, pointsCost: r.pointsCost }))}
                      restaurants={rs}
                      defaultRestaurant={f.restaurantId}
                    />
                  )}
                </div>
              </Section>
              {isAdmin ? (
                <Section
                  title="Ajuste manual"
                  description="Suma o resta puntos con un motivo (p. ej. una compensación)."
                  className="mt-0"
                >
                  <div className="panel p-5">
                    <AdjustForm phone={member.phone} restaurants={rs} defaultRestaurant={f.restaurantId} />
                  </div>
                </Section>
              ) : null}
            </div>

            <Section title="Movimientos" className="mt-10">
              <div className="panel overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Detalle</th>
                      <th>Sucursal</th>
                      <th className="text-right">Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.history.map((h) => (
                      <tr key={h.id}>
                        <td className="whitespace-nowrap text-ink-soft">{formatDateTime(h.createdAt)}</td>
                        <td>
                          <Badge tone={KIND[h.kind].tone}>{KIND[h.kind].label}</Badge>
                        </td>
                        <td>
                          {h.kind === "EARN" ? "Contestó la encuesta" : h.kind === "REDEEM" ? h.rewardName : h.note}
                          {h.createdByName ? <span className="text-ink-faint"> · {h.createdByName}</span> : null}
                        </td>
                        <td>{h.restaurantName}</td>
                        <td className={`text-right font-medium tabular-nums ${h.points > 0 ? "text-basil-ink" : "text-chile"}`}>
                          {h.points > 0 ? "+" : ""}
                          {n(h.points)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </>
        )}
      </>
    );
  }

  // ---------- Resumen ----------
  const o = await getLoyaltyOverview(user);
  return (
    <>
      {header}
      {setupNotice}
      <div className="panel mb-8 p-5">
        <SearchForm />
        <p className="hint">Busca al comensal por su celular para ver su saldo y canjear un premio.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={n(o.members)} label="Comensales con puntos" />
        <Stat value={n(o.earned30)} label="Puntos otorgados (30 días)" tone="green" />
        <Stat value={n(o.redemptions30)} label={`Canjes (30 días) · ${n(o.redeemed30)} pts`} tone="amber" />
        {o.outstanding !== null ? <Stat value={n(o.outstanding)} label="Puntos sin canjear (cadena)" /> : null}
      </div>
      <Section title="Movimientos recientes" className="mt-10">
        {o.recent.length === 0 ? (
          <EmptyState title="Aún no hay movimientos">Aquí aparecerán los puntos ganados y canjeados.</EmptyState>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Celular</th>
                  <th>Tipo</th>
                  <th>Sucursal</th>
                  <th className="text-right">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {o.recent.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap text-ink-soft">{formatDateTime(h.createdAt)}</td>
                    <td>
                      <Link href={`/admin/points?tel=${h.phone}`} className="link tabular-nums">
                        {formatPhone(h.phone)}
                      </Link>
                    </td>
                    <td>
                      <Badge tone={KIND[h.kind].tone}>{KIND[h.kind].label}</Badge>
                      {h.rewardName ? <span className="ml-2 text-ink-soft">{h.rewardName}</span> : null}
                    </td>
                    <td>{h.restaurantName}</td>
                    <td className={`text-right font-medium tabular-nums ${h.points > 0 ? "text-basil-ink" : "text-chile"}`}>
                      {h.points > 0 ? "+" : ""}
                      {n(h.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
