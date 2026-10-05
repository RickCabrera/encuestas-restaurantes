import Link from "next/link";
import { createUserAction } from "@/app/actions/users";
import { PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { UserForm } from "../user-form";

export const metadata = { title: "Agregar usuario" };

export default async function NewUserPage() {
  const admin = await requireAdmin();
  const restaurants = await listAccessibleRestaurants(admin, { includeInactive: true });
  return (
    <>
      <PageHeader
        title="Agregar usuario"
        back={
          <Link href="/admin/users" className="link">
            Usuarios
          </Link>
        }
      />
      <UserForm action={createUserAction} restaurants={restaurants} />
    </>
  );
}
