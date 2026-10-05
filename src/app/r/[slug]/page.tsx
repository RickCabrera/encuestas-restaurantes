import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { logoUrl } from "@/lib/ids";
import { getActiveRunnerSurvey, getRestaurantBySlug } from "@/lib/queries/public";
import { SLUG_REGEX } from "@/lib/slug";
import { PublicSurvey } from "./public-survey";
import { Unavailable } from "./unavailable";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f3f5f2",
};

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ mesa?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = SLUG_REGEX.test(slug) ? await getRestaurantBySlug(slug) : undefined;
  return { title: r ? `Califica tu visita a ${r.name}` : "Encuesta no encontrada" };
}

export default async function PublicSurveyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { mesa } = await searchParams;
  if (!SLUG_REGEX.test(slug)) notFound();
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) notFound();

  const brand = {
    name: restaurant.name,
    primaryColor: restaurant.primaryColor,
    logoUrl: restaurant.logoMime ? logoUrl(restaurant) : null,
  };

  if (!restaurant.active) {
    return (
      <Unavailable
        restaurant={brand}
        title="Encuesta no disponible"
        text="Este restaurante no está recibiendo encuestas por ahora."
      />
    );
  }
  const survey = await getActiveRunnerSurvey(restaurant.id);
  if (!survey) {
    return (
      <Unavailable
        restaurant={brand}
        title="Encuesta no disponible"
        text="Vuelve a intentarlo más tarde. Gracias por tu interés."
      />
    );
  }

  const tableRef = mesa && /^[\w-]{1,20}$/.test(mesa) ? mesa : null;
  return <PublicSurvey survey={survey} restaurant={brand} tableRef={tableRef} restaurantKey={restaurant.id} />;
}
