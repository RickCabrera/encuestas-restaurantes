/* Seed de desarrollo / demo: `npm run db:seed` */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import * as s from "../src/db/schema";
import { kioskPinHash } from "../src/lib/crypto";
import { isLowScore, type NormalizedAnswer } from "../src/lib/survey-rules";
import { BASE_TEMPLATE, DEFAULT_CLOSING, DEFAULT_WELCOME } from "../src/lib/survey-template";

const DEMO_COMMENTS = [
  "Los camarones al mojo de ajo, excelentes.",
  "Tardaron un poco en traer la cuenta.",
  "El café lechero como siempre, buenísimo.",
  "La música estaba muy alta.",
  "Muy amable la mesera, nos recomendó el pescado a la veracruzana.",
  "El aire acondicionado no funcionaba en la terraza.",
  "Todo perfecto, volveremos con la familia.",
  "La comida llegó fría.",
];

function rand<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weighted(min: number, max: number, bias: number) {
  // bias > 1 empuja hacia valores altos.
  return Math.round(min + (max - min) * Math.pow(Math.random(), 1 / bias));
}

async function main() {
  const withDemo = process.argv.includes("--demo");
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@demo.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin12345!";

  console.log("Limpiando tablas…");
  await db.execute(
    sql`TRUNCATE answers, responses, questions, surveys, devices, user_restaurants, password_reset_tokens, rate_limits, restaurants, users CASCADE`,
  );

  const [admin] = await db
    .insert(s.users)
    .values({
      name: "Administrador",
      email: adminEmail.toLowerCase(),
      passwordHash: await bcrypt.hash(adminPassword, 10),
      role: "ADMIN",
      notifyLowScores: true,
    })
    .returning();

  const restaurantsData = [
    { name: "Casa Jarocha Centro", slug: "centro", address: "Av. Independencia 100, Veracruz" },
    { name: "Casa Jarocha Boca del Río", slug: "boca-del-rio", address: "Blvd. Ávila Camacho 200, Boca del Río" },
  ];

  const restaurants = [];
  for (const r of restaurantsData) {
    const id = randomUUID();
    const [row] = await db
      .insert(s.restaurants)
      .values({ id, ...r, kioskPinHash: kioskPinHash(id, "1234") })
      .returning();
    restaurants.push(row);
  }

  const [manager] = await db
    .insert(s.users)
    .values({
      name: "Gerente Centro",
      email: "gerente@demo.com",
      passwordHash: await bcrypt.hash("Gerente12345!", 10),
      role: "MANAGER",
    })
    .returning();
  await db.insert(s.userRestaurants).values({ userId: manager.id, restaurantId: restaurants[0].id });

  for (const r of restaurants) {
    const [survey] = await db
      .insert(s.surveys)
      .values({
        restaurantId: r.id,
        title: "Experiencia en restaurante",
        welcomeText: DEFAULT_WELCOME,
        closingText: DEFAULT_CLOSING,
        status: "ACTIVE",
        // Publicada antes de la respuesta demo más antigua (60 días).
        publishedAt: new Date(Date.now() - 61 * 24 * 3600 * 1000),
      })
      .returning();
    const qs = await db
      .insert(s.questions)
      .values(BASE_TEMPLATE.map((q, i) => ({ ...q, surveyId: survey.id, position: i })))
      .returning();

    const [device] = await db.insert(s.devices).values({ restaurantId: r.id, name: "Tablet entrada" }).returning();

    if (!withDemo) continue;

    const bias = r.slug === "centro" ? 2.2 : 1.5;
    const count = 90 + Math.floor(Math.random() * 40);
    for (let i = 0; i < count; i++) {
      const submittedAt = new Date(Date.now() - Math.random() * 60 * 24 * 3600 * 1000);
      const answers: NormalizedAnswer[] = qs.flatMap((q): NormalizedAnswer[] => {
        const base = { questionId: q.id, valueNumber: null, valueBool: null, valueText: null };
        switch (q.type) {
          case "YES_NO":
            return [{ ...base, valueBool: Math.random() < (q.metric === "FIRST_VISIT" ? 0.35 : 0.6) }];
          case "RATING_5":
            return [{ ...base, valueNumber: weighted(1, 5, bias) }];
          case "NPS_10":
            return [{ ...base, valueNumber: weighted(0, 10, bias) }];
          case "TEXT":
            return Math.random() < 0.3 ? [{ ...base, valueText: rand(DEMO_COMMENTS) }] : [];
          default:
            return [];
        }
      });
      const kiosk = Math.random() < 0.75;
      const [resp] = await db
        .insert(s.responses)
        .values({
          id: randomUUID(),
          surveyId: survey.id,
          restaurantId: r.id,
          channel: kiosk ? "KIOSK" : "QR",
          deviceId: kiosk ? device.id : null,
          tableRef: kiosk ? null : Math.random() < 0.5 ? String(1 + Math.floor(Math.random() * 20)) : null,
          startedAt: new Date(submittedAt.getTime() - 40_000),
          submittedAt,
          receivedAt: submittedAt,
          durationSec: 20 + Math.floor(Math.random() * 60),
          lowScore: isLowScore(qs, answers),
        })
        .returning();
      await db.insert(s.answers).values(answers.map((a) => ({ ...a, responseId: resp.id })));
    }
  }

  console.log("Listo.");
  console.log(`  Admin:   ${admin.email} / ${adminPassword}`);
  console.log(`  Gerente: gerente@demo.com / Gerente12345!  (solo ${restaurants[0].name})`);
  console.log(`  PIN de kiosko: 1234`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
