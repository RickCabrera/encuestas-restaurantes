import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { logoUrl } from "@/lib/ids";
import { getAccessibleSurvey } from "@/lib/queries/surveys";
import { PreviewFrame } from "./preview-frame";

export const metadata = { title: "Vista previa" };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const survey = await getAccessibleSurvey(user, id);
  if (!survey) notFound();

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
