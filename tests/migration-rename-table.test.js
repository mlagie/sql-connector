const { MigrationRunner } = require("../src/migration/MigrationRunner");
const { createDialect } = require("../src/db/dialects");

describe("table rename migrations", () => {
    const runner = new MigrationRunner({
        connection: {},
        dialect: createDialect("postgres"),
        store: {},
        backupManager: {}
    });

    test("generates dialect-safe table rename SQL", () => {
        expect(runner.sqlForOperation({
            type: "renameTable",
            oldName: "nexus_events",
            newName: "events"
        })).toBe('ALTER TABLE "nexus_events" RENAME TO "events";');
    });

    test("builds the reverse operation for rollback", () => {
        expect(runner.buildRollbackOperations({
            operations: [{ type: "renameTable", oldName: "nexus_events", newName: "events" }],
            previousSnapshot: { tables: { nexus_events: { columns: {} } } }
        })).toEqual([
            { type: "renameTable", oldName: "events", newName: "nexus_events" }
        ]);
    });
});
