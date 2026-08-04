import { index, jsonb, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const opsweaveSchema = pgSchema("opsweave");

export const systemMetadata = opsweaveSchema.table(
  "system_metadata",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("system_metadata_updated_at_idx").on(table.updatedAt)],
);
