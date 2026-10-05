import { Badge } from "@/components/ui/primitives";
import type { SurveyStatus } from "@/db/schema";

export function StatusBadge({ status }: { status: SurveyStatus }) {
  if (status === "ACTIVE") return <Badge tone="green">Activa</Badge>;
  if (status === "DRAFT") return <Badge tone="amber">Borrador</Badge>;
  return <Badge>Archivada</Badge>;
}
