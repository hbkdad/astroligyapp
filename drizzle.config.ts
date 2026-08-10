import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://cosmic:cosmic_local_only@127.0.0.1:55432/cosmic",
  },
  strict: true,
  verbose: true,
});
