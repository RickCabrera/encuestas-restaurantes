import type { RunnerRestaurant } from "@/components/survey/types";

export function Unavailable({ restaurant, title, text }: { restaurant: RunnerRestaurant; title: string; text: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      {restaurant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={restaurant.logoUrl} alt="" className="mb-6 h-16 w-16 object-contain" />
      ) : null}
      <p className="font-display text-lg font-semibold text-ink-soft">{restaurant.name}</p>
      <h1 className="mt-4 font-display text-4xl font-semibold">{title}</h1>
      <p className="mt-3 max-w-md text-lg text-ink-soft">{text}</p>
    </main>
  );
}
