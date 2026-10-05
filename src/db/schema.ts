import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const userRole = pgEnum("user_role", ["ADMIN", "MANAGER"]);
export const surveyStatus = pgEnum("survey_status", ["DRAFT", "ACTIVE", "ARCHIVED"]);
export const questionType = pgEnum("question_type", ["YES_NO", "RATING_5", "NPS_10", "SINGLE_CHOICE", "TEXT"]);
/** Indicador de negocio al que alimenta una pregunta (para el dashboard). */
export const questionMetric = pgEnum("question_metric", [
  "NONE",
  "FIRST_VISIT",
  "FOOD",
  "CAPTAIN_VISIT",
  "SERVICE",
  "RECOMMEND",
  "COMMENT",
]);
export const responseChannel = pgEnum("response_channel", ["KIOSK", "QR"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("MANAGER"),
  active: boolean("active").notNull().default(true),
  notifyLowScores: boolean("notify_low_scores").notNull().default(false),
  /** Se incrementa al cambiar la contraseña para invalidar sesiones previas. */
  sessionVersion: integer("session_version").notNull().default(1),
  ...timestamps,
});

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  primaryColor: text("primary_color").notNull().default("#2F6B4F"),
  kioskPinHash: text("kiosk_pin_hash").notNull(),
  /** Segundos que se muestra el mensaje de cierre antes de volver a la bienvenida. */
  kioskResetSeconds: integer("kiosk_reset_seconds").notNull().default(8),
  /** Segundos de inactividad para descartar una encuesta a medias. */
  kioskIdleSeconds: integer("kiosk_idle_seconds").notNull().default(60),
  logoData: bytea("logo_data"),
  logoMime: text("logo_mime"),
  logoUpdatedAt: timestamp("logo_updated_at", { withTimezone: true }),
  ...timestamps,
});

export const userRestaurants = pgTable(
  "user_restaurants",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.restaurantId] })],
);

export type QuestionOptions = { choices?: string[] };

export const surveys = pgTable(
  "surveys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    welcomeText: text("welcome_text").notNull().default(""),
    closingText: text("closing_text").notNull().default("¡Vuelva pronto! 🙂"),
    status: surveyStatus("status").notNull().default("DRAFT"),
    version: integer("version").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    index("surveys_restaurant_idx").on(t.restaurantId),
    // Garantiza a nivel BD una sola encuesta ACTIVA por restaurante.
    uniqueIndex("surveys_one_active_per_restaurant")
      .on(t.restaurantId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: questionType("type").notNull(),
    text: text("text").notNull(),
    required: boolean("required").notNull().default(true),
    metric: questionMetric("metric").notNull().default("NONE"),
    options: jsonb("options").$type<QuestionOptions>(),
  },
  (t) => [index("questions_survey_idx").on(t.surveyId)],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").unique(),
    pairingCode: text("pairing_code"),
    pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }),
    pairedAt: timestamp("paired_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("devices_pairing_idx").on(t.pairingCode)],
);

export const responses = pgTable(
  "responses",
  {
    /** Generado en el cliente para que el envío sea idempotente (cola offline). */
    id: uuid("id").primaryKey(),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => surveys.id, { onDelete: "cascade" }),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    channel: responseChannel("channel").notNull(),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    tableRef: text("table_ref"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    durationSec: integer("duration_sec"),
    lowScore: boolean("low_score").notNull().default(false),
  },
  (t) => [
    index("responses_restaurant_submitted_idx").on(t.restaurantId, t.submittedAt),
    index("responses_survey_idx").on(t.surveyId),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    valueNumber: integer("value_number"),
    valueBool: boolean("value_bool"),
    valueText: text("value_text"),
  },
  (t) => [index("answers_response_idx").on(t.responseId), index("answers_question_idx").on(t.questionId)],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps,
});

/** Enlaces de registro de un solo uso. No hay registro público: sin invitación no se crea cuenta. */
export const signupInvites = pgTable("signup_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** SHA-256 del token; el token en claro solo existe en el enlace. */
  tokenHash: text("token_hash").notNull().unique(),
  role: userRole("role").notNull().default("ADMIN"),
  /** Restaurantes que verá si el rol es MANAGER. */
  restaurantIds: uuid("restaurant_ids")
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: uuid("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

/** Contadores de ventana fija para rate limiting (funciona en serverless). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

// ---------- Relaciones ----------

export const usersRelations = relations(users, ({ many }) => ({
  restaurants: many(userRestaurants),
}));

export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  surveys: many(surveys),
  devices: many(devices),
  users: many(userRestaurants),
}));

export const userRestaurantsRelations = relations(userRestaurants, ({ one }) => ({
  user: one(users, { fields: [userRestaurants.userId], references: [users.id] }),
  restaurant: one(restaurants, {
    fields: [userRestaurants.restaurantId],
    references: [restaurants.id],
  }),
}));

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  restaurant: one(restaurants, { fields: [surveys.restaurantId], references: [restaurants.id] }),
  questions: many(questions),
  responses: many(responses),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  survey: one(surveys, { fields: [questions.surveyId], references: [surveys.id] }),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  restaurant: one(restaurants, { fields: [devices.restaurantId], references: [restaurants.id] }),
}));

export const responsesRelations = relations(responses, ({ one, many }) => ({
  survey: one(surveys, { fields: [responses.surveyId], references: [surveys.id] }),
  restaurant: one(restaurants, {
    fields: [responses.restaurantId],
    references: [restaurants.id],
  }),
  device: one(devices, { fields: [responses.deviceId], references: [devices.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  response: one(responses, { fields: [answers.responseId], references: [responses.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}));

export type User = typeof users.$inferSelect;
export type Restaurant = typeof restaurants.$inferSelect;
export type Survey = typeof surveys.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Response = typeof responses.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type SignupInvite = typeof signupInvites.$inferSelect;
export type QuestionType = (typeof questionType.enumValues)[number];
export type QuestionMetric = (typeof questionMetric.enumValues)[number];
export type SurveyStatus = (typeof surveyStatus.enumValues)[number];
export type ResponseChannel = (typeof responseChannel.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
