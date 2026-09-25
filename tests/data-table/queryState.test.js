import { describe, expect, test } from "bun:test";

import {
  lastPage,
  parseEnum,
  parseOneOf,
  parsePositiveInt,
  parseText,
  readSingle,
  serializeParams,
  serializeRawSearchParams,
  toRawSearchParams,
} from "../../src/lib/data-table/queryState";

describe("primitives", () => {
  test("readSingle treats a repeated key as invalid", () => {
    expect(readSingle({ a: "1" }, "a")).toBe("1");
    expect(readSingle({ a: ["1", "2"] }, "a")).toBeUndefined();
    expect(readSingle({}, "a")).toBeUndefined();
  });

  test("parsers fall back on anything outside their domain", () => {
    expect(parseText(undefined, 5)).toBe("");
    expect(parseText("  abcdefgh ", 5)).toBe("abcde");
    expect(parseEnum("b", ["a", "b"], "a")).toBe("b");
    expect(parseEnum("c", ["a", "b"], "a")).toBe("a");
    expect(parseEnum("constructor", ["a"], "a")).toBe("a");
    expect(parsePositiveInt("12", 100, 1)).toBe(12);
    expect(parsePositiveInt("101", 100, 1)).toBe(1);
    expect(parsePositiveInt("0x10", 100, 1)).toBe(1);
    expect(parsePositiveInt(" 3", 100, 1)).toBe(1);
    expect(parsePositiveInt("9".repeat(20), Number.MAX_SAFE_INTEGER, 1)).toBe(1);
    expect(parseOneOf("25", [10, 25], 10)).toBe(25);
    expect(parseOneOf("26", [10, 25], 10)).toBe(10);
    expect(parseOneOf("25.0", [10, 25], 10)).toBe(10);
  });

  test("serialization keeps order, omits defaults and encodes values", () => {
    expect(
      serializeParams([
        { key: "q", value: "a&b c", default: "" },
        { key: "page", value: 1, default: 1 },
        { key: "size", value: 50, default: 25 },
      ]),
    ).toBe("?q=a%26b+c&size=50");
    expect(serializeParams([{ key: "page", value: 1, default: 1 }])).toBe("");
  });

  test("raw params convert both ways and preserve repeats", () => {
    const raw = toRawSearchParams(new URLSearchParams("a=1&b=2&b=3"));
    expect(raw).toEqual({ a: "1", b: ["2", "3"] });
    expect(serializeRawSearchParams(raw)).toBe("?a=1&b=2&b=3");
    expect(serializeRawSearchParams({ a: undefined })).toBe("");
  });

  test("lastPage never drops below one", () => {
    expect(lastPage(0, 25)).toBe(1);
    expect(lastPage(25, 25)).toBe(1);
    expect(lastPage(26, 25)).toBe(2);
  });
});
