import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

export const id = {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
};

export const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const baseColumns = {
  ...id,
  ...timestamps,
};