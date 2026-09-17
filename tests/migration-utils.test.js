const {
    assertIdentifier,
    quoteIdentifier,
    normalizeType,
    normalizeDefault,
    stableStringify,
    sha256,
    migrationId,
    parseDuration,
    clone
} = require("../src/migration/utils");

describe("migration utils", () => {
    test("parses retention durations", () => {
        expect(parseDuration("14d")).toBe(14 * 24 * 60 * 60 * 1000);
        expect(parseDuration("2h")).toBe(2 * 60 * 60 * 1000);
        expect(parseDuration(null)).toBeNull();
    });

    test("parses every supported duration unit", () => {
        expect(parseDuration("5ms")).toBe(5);
        expect(parseDuration("5s")).toBe(5000);
        expect(parseDuration("5m")).toBe(5 * 60_000);
        expect(parseDuration("5h")).toBe(5 * 3_600_000);
        expect(parseDuration("5w")).toBe(5 * 604_800_000);
    });

    test("returns null for false/undefined and passes through valid numbers", () => {
        expect(parseDuration(false)).toBeNull();
        expect(parseDuration(undefined)).toBeNull();
        expect(parseDuration(1000)).toBe(1000);
    });

    test("rejects invalid retention durations", () => {
        expect(() => parseDuration("abc")).toThrow("Invalid retention duration: abc");
        expect(() => parseDuration(-5)).toThrow("Invalid retention duration: -5");
    });

    test("stable stringify is deterministic", () => {
        expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
    });

    test("stable stringify handles primitives, null and arrays", () => {
        expect(stableStringify(null)).toBe("null");
        expect(stableStringify(42)).toBe("42");
        expect(stableStringify([1, "a", null])).toBe('[1,"a",null]');
    });

    test("sha256 returns a 64-character digest", () => {
        expect(sha256("hello")).toHaveLength(64);
    });

    test("assertIdentifier validates and rejects identifiers", () => {
        expect(assertIdentifier("valid_name")).toBe("valid_name");
        expect(() => assertIdentifier("1bad")).toThrow("Invalid identifier: 1bad");
        expect(() => assertIdentifier("bad-name", "column")).toThrow("Invalid column: bad-name");
        expect(() => assertIdentifier(123)).toThrow("Invalid identifier: 123");
    });

    test("quoteIdentifier wraps a valid identifier with the given quote", () => {
        expect(quoteIdentifier("users", "`")).toBe("`users`");
        expect(() => quoteIdentifier("bad name", "`")).toThrow("Invalid identifier: bad name");
    });

    test("normalizeType extracts a type name from constructors, objects and strings", () => {
        expect(normalizeType({ type: String })).toBe("String");
        expect(normalizeType({ type: { name: "Custom" } })).toBe("Custom");
        expect(normalizeType({ type: "varchar" })).toBe("varchar");
        expect(normalizeType({})).toBeUndefined();
        expect(normalizeType(null)).toBeUndefined();
    });

    test("normalizeDefault normalizes primitive default values", () => {
        expect(normalizeDefault(undefined)).toBeUndefined();
        expect(normalizeDefault(null)).toBeNull();
        expect(normalizeDefault("value")).toBe("value");
        expect(normalizeDefault(42)).toBe(42);
        expect(normalizeDefault(true)).toBe(true);
        expect(normalizeDefault(() => "x")).toBe("() => \"x\"");
    });

    test("migrationId generates a timestamped slug from a name", () => {
        const id = migrationId("My Migration!!");
        expect(id).toMatch(/^\d{14}_My_Migration$/);
    });

    test("migrationId defaults the name and falls back when fully sanitized away", () => {
        const defaultId = migrationId();
        expect(defaultId).toMatch(/^\d{14}_migration$/);

        const fallbackId = migrationId("!!!");
        expect(fallbackId).toMatch(/^\d{14}_migration$/);
    });

    test("clone deep copies a value without preserving references", () => {
        const original = { a: { b: [1, 2, 3] } };
        const copy = clone(original);

        expect(copy).toEqual(original);
        expect(copy).not.toBe(original);
        expect(copy.a).not.toBe(original.a);
    });
});
