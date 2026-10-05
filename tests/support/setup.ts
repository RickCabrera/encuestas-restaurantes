// Las pruebas usan una BD separada. Por defecto: encuestas_test local.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/encuestas_test";
process.env.AUTH_SECRET ??= "test-secret-0123456789abcdef0123456789abcdef";
process.env.APP_TIMEZONE ??= "America/Mexico_City";
