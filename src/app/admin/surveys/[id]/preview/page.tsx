import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { surveys } from "@/db/schema";
import { PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { canAccessRestaurant } from "@/lib/authz";
import { isUuid, logoUrl } from "@/lib/ids";
import { PreviewFrame } from "./preview-frame";

export const metadata = { title: "Vista previa" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const survey = await db.query.surveys.findFirst({
    where: eq(surveys.id, id),
    with: {
      questions: { orderBy: (q, { asc }) => asc(q.position) },
      restaurant: true,
    },
  });
  if (!survey || !canAccessRestaurant(user, survey.restaurantId)) notFound();

  return (
    <>
      <PageHeader
        title="Vista previa"
        back={
          <Link href={`/admin/surveys/${id}`} className="link">
            {survey.title}
          </Link>
        }
        description="Así la verá el comensal. Las respuestas de la vista previa no se guardan."
      />
      <PreviewFrame
        survey={{
          id: survey.id,
          welcomeText: survey.welcomeText,
          closingText: survey.closingText,
          questions: survey.questions.map((q) => ({
            id: q.id,
            type: q.type,
            text: q.text,
            required: q.required,
            options: q.options,
          })),
        }}
        restaurant={{
          name: survey.restaurant.name,
          primaryColor: survey.restaurant.primaryColor,
          logoUrl: survey.restaurant.logoMime ? logoUrl(survey.restaurant) : null,
        }}
      />
    </>
  );
}
