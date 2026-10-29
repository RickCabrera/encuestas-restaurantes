"use server";

import { revalidatePath } from "next/cache";
import { isLocalMode } from "@/lib/app-mode";
import { requireUser } from "@/lib/auth";
import { syncOrg } from "@/lib/license-local";

/** "Sincronizar ahora" en la PC (modo SYNC). */
export async function syncNowAction() {
  if (!isLocalMode()) return;
  const user = await requireUser();
  await syncOrg(user.organizationId);
  revalidatePath("/admin", "layout");
}
