const {
    MigrationError,
    DestructiveMigrationError,
    MigrationChecksumError
} = require("../src/migration/errors");

describe("migration errors", () => {
    test("MigrationError sets name, code and details", () => {
        const err = new MigrationError("boom");
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe("MigrationError");
        expect(err.code).toBe("MIGRATION_ERROR");
        expect(err.details).toBeUndefined();

        const withDetails = new MigrationError("boom2", "CUSTOM_CODE", { table: "users" });
        expect(withDetails.code).toBe("CUSTOM_CODE");
        expect(withDetails.details).toEqual({ table: "users" });
    });

    test("DestructiveMigrationError sets its own name and fixed code", () => {
        const err = new DestructiveMigrationError("dropping column", { table: "users", column: "email" });
        expect(err).toBeInstanceOf(MigrationError);
        expect(err.name).toBe("DestructiveMigrationError");
        expect(err.code).toBe("DESTRUCTIVE_MIGRATION");
        expect(err.details).toEqual({ table: "users", column: "email" });
    });

    test("MigrationChecksumError sets its own name and fixed code", () => {
        const err = new MigrationChecksumError("checksum mismatch", { expected: "a", actual: "b" });
        expect(err).toBeInstanceOf(MigrationError);
        expect(err.name).toBe("MigrationChecksumError");
        expect(err.code).toBe("MIGRATION_CHECKSUM_MISMATCH");
        expect(err.details).toEqual({ expected: "a", actual: "b" });
    });
});
