import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateUserAction } from "@/app/actions/users";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { UserForm } from "../user-form";

export const metadata = { title: "Editar usuario" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await db.query.users.findFirst({ where: eq(users.id, id), with: { restaurants: true } });
  if (!user) notFound();
  const restaurants = await listAccessibleRestaurants(admin, { includeInactive: true });
  return (
    <>
      <PageHeader
        title={user.name}
        back={
          <Link href="/admin/users" className="link">
            Usuarios
          </Link>
        }
      />
      <UserForm
        action={updateUserAction.bind(null, user.id)}
        restaurants={restaurants}
        values={{
          name: user.name,
          email: user.email,
          role: user.role,
          notifyLowScores: user.notifyLowScores,
          restaurantIds: user.restaurants.map((r) => r.restaurantId),
        }}
      />
    </>
  );
}
