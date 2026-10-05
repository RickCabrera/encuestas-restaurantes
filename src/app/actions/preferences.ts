"use server";

import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { canAccessRestaurant } from "@/lib/authz";
import { RESTAURANT_COOKIE } from "@/lib/filters";

/** Guarda el restaurante elegido en el selector global (persistente en la sesión). */
export async function setRestaurantFilterAction(restaurantId: string) {
  const user = await requireUser();
  const jar = await cookies();
  if (restaurantId === "all" || !canAccessRestaurant(user, restaurantId)) {
    jar.delete(RESTAURANT_COOKIE);
  } else {
    jar.set(RESTAURANT_COOKIE, restaurantId, { httpOnly: true, sameSite: "lax", path: "/" });
  }
}
