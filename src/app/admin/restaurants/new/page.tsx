import Link from "next/link";
import { createRestaurantAction } from "@/app/actions/restaurants";
import { PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { appUrl } from "@/lib/request";
import { RestaurantForm } from "../restaurant-form";

export const metadata = { title: "Agregar restaurante" };

export default async function NewRestaurantPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Agregar restaurante"
        back={
          <Link href="/admin/restaurants" className="link">
            Restaurantes
          </Link>
        }
        description="Después de crearlo podrás asignarle una encuesta, vincular tablets e imprimir su QR."
      />
      <RestaurantForm action={createRestaurantAction} appUrl={await appUrl()} />
    </>
  );
}
