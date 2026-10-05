import Link from "next/link";
import { PageHeader } from "@/components/ui/primitives";
import { requireAdmin } from "@/lib/auth";
import { listAccessibleRestaurants } from "@/lib/queries/restaurants";
import { NewSurveyForm } from "./new-survey-form";

export const metadata = { title: "Nueva encuesta" };

export default async function NewSurveyPage({ searchParams }: { searchParams: Promise<{ restaurant?: string }> }) {
  const admin = await requireAdmin();
  const { restaurant } = await searchParams;
  const restaurants = await listAccessibleRestaurants(admin);
  return (
    <>
      <PageHeader
        title="Nueva encuesta"
        back={
          <Link href="/admin/surveys" className="link">
            Encuestas
          </Link>
        }
        description="Se crea como borrador. La podrás editar y previsualizar antes de publicarla."
      />
      {restaurants.length === 0 ? (
        <p>
          Primero{" "}
          <Link href="/admin/restaurants/new" className="link">
            agrega un restaurante
          </Link>
          .
        </p>
      ) : (
        <NewSurveyForm restaurants={restaurants} defaultRestaurant={restaurant} />
      )}
    </>
  );
}
