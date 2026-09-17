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

    async rollback(id, options = {}) {
        await this.ensureMigrationTable();
        const applied = await this.applied();
        const existing = applied.find(row => row.id === id);
        if (!existing) throw new Error(`Migration '${id}' is not applied.`);

        // Safety: only the most recently applied migration can be rolled back.
        // This prevents restoring an old snapshot over newer schema/data changes.
        if (!options.allowOutOfOrder) {
            const last = applied[applied.length - 1];
            if (!last || last.id !== id) {
                throw new Error(`Migration '${id}' is not the latest applied migration. Roll back newer migrations first.`);
            }
        }

        const metadata = await this.store.readMigration(id);
        if (!metadata) throw new Error(`Rollback metadata for migration '${id}' was not found.`);
        this.store.validateChecksum(metadata.checksum, existing.checksum);

        const backup = await this.store.readBackup(id);
        if (!backup) throw new Error(`Backup for migration '${id}' was not found. Rollback aborted.`);

        const operations = this.buildRollbackOperations(metadata);
        const run = async () => {
            for (const operation of operations) {
                await this.dialect.execute(this.connection, this.sqlForOperation(operation));
            }
            await this.restoreBackup(backup);
            await this.dialect.execute(this.connection, this.dialect.deleteMigration(), [id]);
        };

        await this.dialect.transaction(this.connection, run);
        await this.store.writeSnapshot(metadata.previousSnapshot || { tables: {} });

        return { rolledBack: true, migrationId: id, operations, backupPath: null };
    }

    buildRollbackOperations(metadata) {
        const previousTables = metadata.previousSnapshot?.tables || {};
        return [...metadata.operations].reverse().map(operation => {
            switch (operation.type) {
                case "createTable":
                    return { type: "dropTable", table: operation.table, destructive: true };
                case "addColumn":
                    return { type: "dropColumn", table: operation.table, column: operation.column, destructive: true };
                case "renameColumn":
                    return { type: "renameColumn", table: operation.table, oldName: operation.newName, newName: operation.oldName };
                case "alterColumn": {
                    const previous = operation.previous || previousTables[operation.table]?.columns?.[operation.column];
                    if (!previous) throw new Error(`Cannot rollback alterColumn '${operation.table}.${operation.column}': previous definition is missing.`);
                    return { type: "alterColumn", table: operation.table, column: operation.column, field: previous };
                }
                case "dropColumn": {
                    const field = previousTables[operation.table]?.columns?.[operation.column];
                    if (!field) throw new Error(`Cannot rollback dropped column '${operation.table}.${operation.column}': previous schema is missing.`);
                    return { type: "addColumn", table: operation.table, column: operation.column, field };
                }
                case "dropTable": {
                    const schema = previousTables[operation.table]?.columns || previousTables[operation.table];
                    if (!schema) throw new Error(`Cannot rollback dropped table '${operation.table}': previous schema is missing.`);
                    return { type: "createTable", table: operation.table, schema };
                }
                default:
                    throw new Error(`Unsupported rollback operation: ${operation.type}`);
            }
        });
    }

    async restoreBackup(backup) {
        for (const [table, rows] of Object.entries(backup.tables || {})) {
            if (!Array.isArray(rows)) throw new Error(`Invalid backup rows for table '${table}'.`);
            await this.dialect.execute(this.connection, `DELETE FROM ${this.dialect.escape(table)};`);
            if (rows.length === 0) continue;

            const columns = Object.keys(rows[0]);
            const escapedColumns = columns.map(column => this.dialect.escape(column)).join(", ");
            for (const row of rows) {
                const values = columns.map(column => row[column]);
                const sql = `INSERT INTO ${this.dialect.escape(table)} (${escapedColumns}) VALUES (${this.dialect.placeholders(values.length)});`;
                await this.dialect.execute(this.connection, sql, values);
            }
        }
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
