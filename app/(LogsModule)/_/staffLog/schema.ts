import { z } from "zod";
import type { StaffLogBlock } from "./blocks";

/**
 * Write and read contracts of the staff log. Writing is strict and bounded;
 * reading is tolerant, because an entry written by an older or newer release
 * must still render: a block this release does not understand becomes a
 * placeholder in its place.
 */

export const STAFF_LOG_LIMITS = {
  idLength: 128,
  actionLength: 150,
  resourceTypeLength: 64,
  labelLength: 200,
  textLength: 4_000,
  hrefLength: 2_000,
  blocks: 50,
} as const;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const hasNoControlCharacters = (content: string) => !CONTROL_CHARACTERS.test(content);
const controlMessage = { error: "Control characters are not allowed." };

/** Identifiers of any module's resources: opaque, not assumed to be UUIDs. */
export const staffLogIdSchema = z.string().min(1).max(STAFF_LOG_LIMITS.idLength).refine(hasNoControlCharacters, controlMessage);

/** A stable lowercase key, e.g. `user.banned`. */
export const staffLogActionSchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,149}$/);

export const staffLogResourceTypeSchema = z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/);

const labelSchema = z.string().min(1).max(STAFF_LOG_LIMITS.labelLength).refine(hasNoControlCharacters, controlMessage);
const contentSchema = z.string().min(1).max(STAFF_LOG_LIMITS.textLength).refine(hasNoControlCharacters, controlMessage);

/** Never a `javascript:` or `data:` address: http(s), or a path of this application. */
const hrefSchema = z
  .string()
  .min(1)
  .max(STAFF_LOG_LIMITS.hrefLength)
  .refine(hasNoControlCharacters, controlMessage)
  .refine((href) => /^https?:\/\/\S+$/i.test(href) || /^\/(?!\/)\S*$/.test(href), {
    error: "Use an http(s) address or an application path.",
  });

export const staffLogBlockSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), value: contentSchema }),
  z.strictObject({ type: z.literal("user"), id: staffLogIdSchema, label: labelSchema }),
  z.strictObject({ type: z.literal("date"), value: z.iso.datetime() }),
  z.strictObject({ type: z.literal("url"), href: hrefSchema, label: labelSchema }),
  z.strictObject({ type: z.literal("value"), value: contentSchema }),
]);

export const staffLogEntrySchema = z.strictObject({
  action: staffLogActionSchema,
  resource: z.strictObject({ type: staffLogResourceTypeSchema, id: staffLogIdSchema }),
  message: z.array(staffLogBlockSchema).min(1).max(STAFF_LOG_LIMITS.blocks),
});

export type StaffLogEntrySchema = z.infer<typeof staffLogEntrySchema>;

/** A stored block as read back; `unsupported` stands in for what this release cannot render. */
export type StaffLogBlockView = StaffLogBlock | { type: "unsupported" };

/** Every stored block, in order, without echoing what could not be read. */
export function toStaffLogBlockViews(stored: unknown): StaffLogBlockView[] {
  if (!Array.isArray(stored)) return [{ type: "unsupported" }];
  return stored.map((block): StaffLogBlockView => {
    const parsed = staffLogBlockSchema.safeParse(block);
    return parsed.success ? parsed.data : { type: "unsupported" };
  });
}
