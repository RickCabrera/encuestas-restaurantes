import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
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
/** USER: cuenta dentro de una cadena que ya existe. NEW_ORG: da de alta una cadena nueva con su administrador. */
export const inviteKind = pgEnum("invite_kind", ["USER", "NEW_ORG"]);
/** Cómo se pagó una mensualidad (los pagos se capturan a mano en el panel de Administración). */
export const paymentMethod = pgEnum("payment_method", ["TRANSFER", "CASH", "CARD", "OTHER"]);
/** Estado de una solicitud de demo que llegó desde la landing. */
export const demoRequestStatus = pgEnum("demo_request_status", ["NEW", "CONTACTED", "CONVERTED", "DISCARDED"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Cadena (organización). Todo lo demás cuelga de una: usuarios, restaurantes e invitaciones
 * directamente; encuestas, preguntas, tablets y respuestas a través de su restaurante.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Desactivada: nadie de la cadena entra al panel y sus encuestas (QR y tablets) dejan de recibir respuestas. */
  active: boolean("active").notNull().default(true),
  /** Cadena del equipo que opera Sobremesa (administradores de la plataforma). No aparece como cliente. */
  internal: boolean("internal").notNull().default(false),
  /** Día del mes (1–28) en que vence la mensualidad. */
  billingDay: integer("billing_day").notNull().default(5),
  /**
   * Solo en la PC: el cliente de la nube al que corresponde esta cadena. Una cadena sin cliente
   * de la nube no puede usarse en la PC (nadie entra, ni tablets ni QR).
   */
  cloudOrgId: uuid("cloud_org_id").unique(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notes: text("notes"),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    /** Único en todo el sistema, no por cadena: el login no pregunta la cadena. */
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("MANAGER"),
    active: boolean("active").notNull().default(true),
    notifyLowScores: boolean("notify_low_scores").notNull().default(false),
    /** Se incrementa al cambiar la contraseña para invalidar sesiones previas. */
    sessionVersion: integer("session_version").notNull().default(1),
    /** Puede entrar a la Administración de la plataforma (/plataforma) y ver a todos los clientes. */
    platformAdmin: boolean("platform_admin").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("users_organization_idx").on(t.organizationId)],
);

export const restaurants = pgTable(
  "restaurants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    /** Único en todo el sistema, no por cadena: /r/[slug] es público. */
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
  },
  (t) => [index("restaurants_organization_idx").on(t.organizationId)],
);

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
export const signupInvites = pgTable(
  "signup_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 del token; el token en claro solo existe en el enlace. */
    tokenHash: text("token_hash").notNull().unique(),
    kind: inviteKind("kind").notNull().default("USER"),
    /** Cadena a la que entra la cuenta. Solo es null en NEW_ORG: esa cadena se crea al registrarse. */
    organizationId: uuid("organization_id").references(() => organizations.id),
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
  },
  (t) => [
    index("signup_invites_organization_idx").on(t.organizationId),
    check("signup_invites_org_matches_kind", sql`(${t.kind} = 'NEW_ORG') = (${t.organizationId} is null)`),
  ],
);

/** Mensualidades de cada cliente. Un pago anulado se conserva (con quién y por qué) y se puede restaurar. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Mes que cubre, `YYYY-MM`. */
    period: text("period").notNull(),
    amountCents: integer("amount_cents").notNull(),
    method: paymentMethod("method").notNull(),
    /** Día en que se pagó, `YYYY-MM-DD`. */
    paidOn: text("paid_on").notNull(),
    notes: text("notes"),
    recordedById: uuid("recorded_by_id").references(() => users.id, { onDelete: "set null" }),
    recordedByName: text("recorded_by_name").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByName: text("voided_by_name"),
    voidReason: text("void_reason"),
    ...timestamps,
  },
  (t) => [index("payments_org_period_idx").on(t.organizationId, t.period)],
);

export type InstallationStats = {
  orgNames: string[];
  restaurants: number;
  tablets: number;
  users: number;
  responses30: number;
  lastResponseAt: string | null;
};

/**
 * Instalaciones en PC (el .exe) de un cliente. Cada una se activa con la cuenta del negocio en la
 * nube y renueva su licencia periódicamente; si el cliente se desactiva o la instalación se revoca,
 * deja de renovarse y se bloquea. Solo existe en la nube.
 */
export const installations = pgTable(
  "installations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Nombre de la PC, para reconocerla en la Administración. */
    name: text("name").notNull(),
    /** SHA-256 del secreto que guarda la PC; con él pide renovar su licencia. */
    secretHash: text("secret_hash").notNull().unique(),
    appVersion: text("app_version"),
    activatedByEmail: text("activated_by_email").notNull(),
    /** SHA-256 de la llave de la PC: la misma PC y el mismo cliente reusan su instalación. */
    deviceKeyHash: text("device_key_hash"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByName: text("revoked_by_name"),
    /** Resumen que manda la PC en cada revisión: sus datos viven en la PC, no en la nube. */
    stats: jsonb("stats").$type<InstallationStats>(),
    ...timestamps,
  },
  (t) => [index("installations_organization_idx").on(t.organizationId)],
);

/**
 * Solo en la PC: la licencia de cada cadena, firmada por la nube para su cliente.
 * Cada cadena tiene la suya; sin licencia vigente esa cadena no opera en la PC.
 */
export const orgLicenses = pgTable("org_licenses", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  installationId: uuid("installation_id").notNull(),
  secret: text("secret").notNull(),
  token: text("token"),
  /** "inactive" (cliente desactivado) o "revoked" (PC dada de baja): lo dijo la nube. */
  block: text("block"),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Personas interesadas que dejaron sus datos en la landing para pedir una demo. */
export const demoRequests = pgTable(
  "demo_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    business: text("business").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    city: text("city"),
    branches: text("branches"),
    message: text("message"),
    status: demoRequestStatus("status").notNull().default("NEW"),
    notes: text("notes"),
    /** Cliente que se dio de alta a partir de esta solicitud, si ya se convirtió. */
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("demo_requests_status_idx").on(t.status, t.createdAt)],
);

/** Contadores de ventana fija para rate limiting (funciona en serverless). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

// ---------- Relaciones ----------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  restaurants: many(restaurants),
  payments: many(payments),
}));

export const installationsRelations = relations(installations, ({ one }) => ({
  organization: one(organizations, { fields: [installations.organizationId], references: [organizations.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  organization: one(organizations, { fields: [payments.organizationId], references: [organizations.id] }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
  restaurants: many(userRestaurants),
}));

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  organization: one(organizations, { fields: [restaurants.organizationId], references: [organizations.id] }),
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

/**
 * Valores de la instalación completa (no de una cadena). En la versión instalada en PC guarda,
 * por ejemplo, la dirección que el administrador ya confirmó tras un cambio de IP.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Restaurant = typeof restaurants.$inferSelect;
export type Survey = typeof surveys.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type Response = typeof responses.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type DemoRequest = typeof demoRequests.$inferSelect;
export type Installation = typeof installations.$inferSelect;
export type OrgLicense = typeof orgLicenses.$inferSelect;
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];
export type DemoRequestStatus = (typeof demoRequestStatus.enumValues)[number];
export type SignupInvite = typeof signupInvites.$inferSelect;
export type QuestionType = (typeof questionType.enumValues)[number];
export type QuestionMetric = (typeof questionMetric.enumValues)[number];
export type SurveyStatus = (typeof surveyStatus.enumValues)[number];
export type ResponseChannel = (typeof responseChannel.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
