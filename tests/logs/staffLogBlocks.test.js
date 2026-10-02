import { describe, expect, test } from "bun:test";
import {
  UNNAMED_USER_LABEL,
  blockText,
  date,
  messageText,
  text,
  url,
  user,
  value,
} from "../../app/(LogsModule)/_/staffLog/blocks";
import {
  STAFF_LOG_LIMITS,
  staffLogBlockSchema,
  staffLogEntrySchema,
  toStaffLogBlockViews,
} from "../../app/(LogsModule)/_/staffLog/schema";

/** The staff log's message blocks: builders, the rendered sentence, the strict write and tolerant read contracts. */

const anna = { id: "user-42", name: "Anna" };

const banned = [text("Banned "), user(anna), text(" until "), date("2026-09-25T14:32:00.000Z")];

const entry = (change = {}) => ({
  action: "user.banned",
  resource: { type: "user", id: "user-42" },
  message: banned,
  ...change,
});

describe("block builders", () => {
  test("each builder produces its documented shape", () => {
    expect(text("Banned ")).toEqual({ type: "text", value: "Banned " });
    expect(user(anna)).toEqual({ type: "user", id: "user-42", label: "Anna" });
    expect(date("2026-09-25T14:32:00Z")).toEqual({ type: "date", value: "2026-09-25T14:32:00.000Z" });
    expect(date(new Date("2026-09-25T14:32:00.000Z"))).toEqual({ type: "date", value: "2026-09-25T14:32:00.000Z" });
    expect(url("/admin/users/user-42", "Anna's page")).toEqual({
      type: "url",
      href: "/admin/users/user-42",
      label: "Anna's page",
    });
    expect(url("https://example.test/x")).toEqual({
      type: "url",
      href: "https://example.test/x",
      label: "https://example.test/x",
    });
    expect(value("Spam")).toEqual({ type: "value", value: "Spam" });
  });

  test("text keeps its own spacing towards its neighbours", () => {
    expect(text(" until ").value).toBe(" until ");
  });

  test("a user without a usable name is labelled Unnamed user; the ID stays", () => {
    expect(UNNAMED_USER_LABEL).toBe("Unnamed user");
    for (const name of ["", "   ", "\n\t", null, undefined]) {
      expect(user({ id: "user-7", name })).toEqual({ type: "user", id: "user-7", label: "Unnamed user" });
    }
    expect(user({ id: "user-7", name: "  Ada\nLovelace " }).label).toBe("Ada Lovelace");
  });

  test("a value is kept on one line", () => {
    expect(value("first line\nsecond line").value).toBe("first line second line");
    expect(value("  a\r\n\r\n b\t c  ").value).toBe("a b c");
  });

  test("every builder's block passes the write schema", () => {
    for (const block of [...banned, url("/admin/users/user-42"), value("a\nb"), user({ id: "u", name: "" })]) {
      expect(staffLogBlockSchema.safeParse(block).success).toBe(true);
    }
  });
});

describe("the rendered sentence", () => {
  test("a block says what the renderer shows", () => {
    expect(blockText(text("Banned "))).toBe("Banned ");
    expect(blockText(user(anna))).toBe("Anna");
    expect(blockText(url("/admin/users/user-42", "Anna's page"))).toBe("Anna's page");
    expect(blockText(value("Spam"))).toBe("Spam");
    expect(blockText(date("2026-09-25T14:32:00.000Z"))).toBe("Sep 25, 2026, 02:32 PM UTC");
  });

  test("a message joins into one sentence, dates formatted in UTC", () => {
    expect(messageText(banned)).toBe("Banned Anna until Sep 25, 2026, 02:32 PM UTC");
    expect(messageText([text("Changed the name of "), user(anna), text(" to "), value("Anna\nMaria")])).toBe(
      "Changed the name of Anna to Anna Maria",
    );
    // A single-digit day and hour: the day is not padded, the time is.
    expect(messageText([text("Unbanned at "), date("2026-01-05T04:07:59.999Z")])).toBe("Unbanned at Jan 5, 2026, 04:07 AM UTC");
  });

  test("the sentence is one trimmed line", () => {
    expect(messageText([text("  Revoked \n sessions of  "), user(anna), text(" ")])).toBe("Revoked sessions of Anna");
  });
});

describe("the write schema", () => {
  test("a composed entry is accepted as written", () => {
    const parsed = staffLogEntrySchema.safeParse(entry());
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(entry());
  });

  test("an unknown block type is refused", () => {
    expect(staffLogBlockSchema.safeParse({ type: "changes", items: [] }).success).toBe(false);
    expect(staffLogEntrySchema.safeParse(entry({ message: [text("x"), { type: "entity", id: "u-1" }] })).success).toBe(false);
  });

  test("a block with a missing, empty or extra member is refused", () => {
    expect(staffLogBlockSchema.safeParse({ type: "text" }).success).toBe(false);
    expect(staffLogBlockSchema.safeParse({ type: "text", value: "" }).success).toBe(false);
    expect(staffLogBlockSchema.safeParse({ type: "user", id: "u-1" }).success).toBe(false);
    expect(staffLogBlockSchema.safeParse({ type: "user", id: "", label: "Anna" }).success).toBe(false);
    expect(staffLogBlockSchema.safeParse({ type: "text", value: "x", extra: 1 }).success).toBe(false);
    expect(staffLogBlockSchema.safeParse({ type: "date", value: "25 Sep 2026" }).success).toBe(false);
    expect(staffLogBlockSchema.safeParse({ type: "value", value: "a\nb" }).success).toBe(false);
  });

  test("an empty message and one past the block limit are refused", () => {
    expect(staffLogEntrySchema.safeParse(entry({ message: [] })).success).toBe(false);
    const full = Array.from({ length: STAFF_LOG_LIMITS.blocks }, () => text("x"));
    expect(staffLogEntrySchema.safeParse(entry({ message: full })).success).toBe(true);
    expect(staffLogEntrySchema.safeParse(entry({ message: [...full, text("x")] })).success).toBe(false);
  });

  test("an address is http(s) or an application path, never a script or data address", () => {
    const withHref = (href) => staffLogBlockSchema.safeParse({ type: "url", href, label: "Link" }).success;
    for (const href of ["https://example.test/a?b=1", "http://example.test", "/admin/users/user-42", "/"]) {
      expect(withHref(href)).toBe(true);
    }
    for (const href of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//evil.example.test/path",
      "mailto:a@example.test",
      "admin/users",
      "https://example.test/a b",
      "",
    ]) {
      expect(withHref(href)).toBe(false);
    }
  });

  test("an invalid action key or resource is refused", () => {
    for (const action of ["", "User.Banned", "user banned", "1user.banned", ".banned", "user/banned", "a".repeat(151)]) {
      expect(staffLogEntrySchema.safeParse(entry({ action })).success).toBe(false);
    }
    for (const action of ["user.banned", "user.sessions-revoked", "user.name_updated", "a".repeat(150)]) {
      expect(staffLogEntrySchema.safeParse(entry({ action })).success).toBe(true);
    }
    expect(staffLogEntrySchema.safeParse(entry({ resource: { type: "User", id: "user-42" } })).success).toBe(false);
    expect(staffLogEntrySchema.safeParse(entry({ resource: { type: "user", id: "" } })).success).toBe(false);
    expect(staffLogEntrySchema.safeParse(entry({ resource: { type: "user", id: "x".repeat(129) } })).success).toBe(false);
    expect(staffLogEntrySchema.safeParse(entry({ actorId: "user-1" })).success).toBe(false);
  });
});

describe("the tolerant read", () => {
  test("known blocks are returned in order, unknown ones become a placeholder in place", () => {
    expect(
      toStaffLogBlockViews([
        { type: "text", value: "Banned " },
        { type: "changes", items: [{ field: "name", before: "a", after: "b" }] },
        { type: "user", id: "user-42", label: "Anna" },
        { type: "url", href: "javascript:alert(1)", label: "Link" },
        null,
        "text",
        { type: "date", value: "2026-09-25T14:32:00.000Z" },
      ]),
    ).toEqual([
      { type: "text", value: "Banned " },
      { type: "unsupported" },
      { type: "user", id: "user-42", label: "Anna" },
      { type: "unsupported" },
      { type: "unsupported" },
      { type: "unsupported" },
      { type: "date", value: "2026-09-25T14:32:00.000Z" },
    ]);
  });

  test("a placeholder never echoes what could not be read", () => {
    const [view] = toStaffLogBlockViews([{ type: "secret", value: "do-not-echo" }]);
    expect(view).toEqual({ type: "unsupported" });
    expect(JSON.stringify(view)).not.toContain("do-not-echo");
  });

  test("anything but an array is a single placeholder", () => {
    for (const stored of [null, undefined, "Banned Anna", 7, { type: "text", value: "x" }]) {
      expect(toStaffLogBlockViews(stored)).toEqual([{ type: "unsupported" }]);
    }
    expect(toStaffLogBlockViews([])).toEqual([]);
  });
});
