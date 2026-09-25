import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/** The root account is recorded once, when initial setup completes. */
export const installation = pgTable("installation", {
  id: boolean("id").primaryKey().default(true),
  rootUserId: text("root_user_id")
    .notNull()
    .references(() => user.id),
  initializedAt: timestamp("initialized_at").notNull().defaultNow(),
});
