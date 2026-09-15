const fs = require("fs/promises");
const path = require("path");
const { sha256 } = require("./utils");

class MigrationRunner {
    constructor({ connection, dialect, store, backupManager }) {
        this.connection = connection;
        this.dialect = dialect;
        this.store = store;
        this.backupManager = backupManager;
    }

    async ensureMigrationTable() {
        await this.dialect.execute(
            this.connection,
            this.dialect.createMigrationTable()
        );
    }

    async applied() {
        await this.ensureMigrationTable();
        return this.dialect.execute(
            this.connection,
            this.dialect.selectMigrations()
        );
    }

    async execute(plan, options = {}) {
        if (!plan.hasChanges()) {
            return { applied: false, reason: "no-changes", plan };
        }

        if (!plan.approved && options.requireApproval !== false) {
            throw new Error("Migration must be approved with plan.approve() before execution.");
        }

        if (plan.hasDestructiveChanges() && !options.allowDestructiveChanges) {
            throw new Error("Destructive migration requires allowDestructiveChanges=true.");
        }

        await this.ensureMigrationTable();

        const applied = await this.applied();
        const existing = applied.find(row => row.id === plan.id);

        if (existing) {
            if (existing.checksum !== plan.checksum) {
                throw new Error(
                    `Migration '${plan.id}' is already applied with a different checksum.`
                );
            }
            return { applied: false, reason: "already-applied", plan };
        }

        const affectedTables = [...new Set(
            plan.operations
                .filter(operation => operation.table)
                .map(operation => operation.table)
        )];

        const backupPath = await this.backupManager.backupTables(
            affectedTables,
            plan.id
        );

        const run = async () => {
            for (const operation of plan.operations) {
                const sql = this.sqlForOperation(operation);
                await this.dialect.execute(this.connection, sql);
            }

            const now = new Date().toISOString();
            await this.dialect.execute(
                this.connection,
                this.dialect.insertMigration(),
                [plan.id, plan.checksum, now, now]
            );
        };

        await this.dialect.transaction(this.connection, run);
        await this.store.writeMigration(plan);
        await this.store.writeSnapshot(plan.snapshot);
        await this.store.cleanup();

        return {
            applied: true,
            plan,
            backupPath
        };
    }

    sqlForOperation(operation) {
        switch (operation.type) {
            case "createTable":
                return this.dialect.createTable(operation.table, operation.schema);
            case "addColumn":
                return this.dialect.addColumn(operation.table, operation.column, operation.field);
            case "renameColumn":
                return this.dialect.renameColumn(operation.table, operation.oldName, operation.newName);
            case "alterColumn":
                return this.dialect.alterColumn(operation.table, operation.column, operation.field);
            case "dropColumn":
                return this.dialect.dropColumn(operation.table, operation.column);
            case "dropTable":
                return this.dialect.dropTable(operation.table);
            default:
                throw new Error(`Unsupported migration operation: ${operation.type}`);
        }
    }
}

module.exports = { MigrationRunner };
