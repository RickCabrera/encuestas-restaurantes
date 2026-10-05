import { PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { AccountForms } from "./account-forms";

export const metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Mi cuenta" description={`${user.name} — ${user.email}`} />
      <AccountForms notifyLowScores={user.notifyLowScores} />
    </>
  );
}
