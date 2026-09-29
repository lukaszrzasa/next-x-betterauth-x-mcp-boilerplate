import { formatUtcDateTime } from "@/src/lib/date/format";

/**
 * The message of a staff log entry: an ordered array of blocks that reads as
 * one sentence, e.g. "Banned [Anna] until [25 Sep 2026, 14:32 UTC]".
 *
 * Every block is a snapshot taken when the action happened and is complete
 * on its own: rendering is one loop over the array, without a relation, a
 * lookup or another call. A `user` block shows the name it was given; the
 * current state is one click away on the user's page.
 *
 * Blocks are declared here and nowhere else. They are generic on purpose: a
 * new action composes the existing blocks and changes nothing in this module.
 */
export type StaffLogBlock =
  /** Plain wording; carries its own spacing towards its neighbours. */
  | { type: "text"; value: string }
  | { type: "user"; id: string; label: string }
  /** An instant, ISO 8601 UTC. */
  | { type: "date"; value: string }
  /** An absolute http(s) address or a path within the application. */
  | { type: "url"; href: string; label: string }
  /** A value worth setting apart from the wording: a name, an address, a reason. */
  | { type: "value"; value: string };

export type StaffLogMessage = StaffLogBlock[];

export const text = (value: string): StaffLogBlock => ({ type: "text", value });

/** Shown when an account's name is empty; the ID stays the identity. */
export const UNNAMED_USER_LABEL = "Unnamed user";

export const user = (account: { id: string; name: string | null | undefined }): StaffLogBlock => ({
  type: "user",
  id: account.id,
  label: singleLine(account.name ?? "") || UNNAMED_USER_LABEL,
});

export const date = (instant: Date | string): StaffLogBlock => ({
  type: "date",
  value: (instant instanceof Date ? instant : new Date(instant)).toISOString(),
});

export const url = (href: string, label: string = href): StaffLogBlock => ({ type: "url", href, label });

/** Kept on one line: a block is part of a sentence. */
export const value = (content: string): StaffLogBlock => ({ type: "value", value: singleLine(content) });

/** What a block says, as the renderer shows it. */
export function blockText(block: StaffLogBlock): string {
  switch (block.type) {
    case "text":
    case "value":
      return block.value;
    case "user":
    case "url":
      return block.label;
    case "date":
      return formatUtcDateTime(block.value);
  }
}

/** The message as the plain sentence it renders to: what search matches. */
export function messageText(message: readonly StaffLogBlock[]): string {
  return singleLine(message.map(blockText).join(""));
}

function singleLine(content: string): string {
  return content.replace(/[\u0000-\u001F\u007F\s]+/g, " ").trim();
}
