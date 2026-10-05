"use client";

import { Store } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { setRestaurantFilterAction } from "@/app/actions/preferences";

export function RestaurantSelector({ restaurants, selected }: { restaurants: { id: string; name: string }[]; selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const current = params.get("restaurant") ?? selected;

  return (
    <label className="flex items-center gap-2 text-sm">
      <Store size={16} className="text-ink-soft" aria-hidden />
      <span className="sr-only">Restaurante</span>
      <select
        className="input h-9 w-auto min-w-[220px] py-1"
        value={restaurants.some((r) => r.id === current) ? current : "all"}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value;
          start(async () => {
            await setRestaurantFilterAction(value);
            // En una página de detalle (una encuesta, una respuesta…) el contenido es de un
            // restaurante concreto: se regresa al listado de esa sección para no mezclar.
            const segments = pathname.split("/").filter(Boolean);
            if (segments.length > 2) {
              router.replace(`/${segments.slice(0, 2).join("/")}`);
            } else {
              const next = new URLSearchParams(params);
              next.delete("restaurant");
              next.delete("page");
              const qs = next.toString();
              router.replace(qs ? `${pathname}?${qs}` : pathname);
            }
            router.refresh();
          });
        }}
      >
        <option value="all">{restaurants.length === 1 ? restaurants[0].name : "Todos los restaurantes"}</option>
        {restaurants.length > 1
          ? restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))
          : null}
      </select>
    </label>
  );
}
