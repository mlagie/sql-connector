const { sha256, stableStringify, migrationId, clone } = require("./utils");

class MigrationPlan {
    constructor({
        id,
        operations,
        sql,
        snapshot,
        previousSnapshot,
        dialect,
        checksum = sha256(stableStringify({ id, operations, sql })),
        executor = null
    }) {
        this.id = id || migrationId();
        this.operations = operations;
        this.sql = sql;
        this.snapshot = clone(snapshot);
        this.previousSnapshot = clone(previousSnapshot);
        this.dialect = dialect.name;
        this.checksum = checksum;
        this.approved = false;
        this._executor = executor;
    }

    hasChanges() {
        return this.operations.length > 0;
    }

    hasDestructiveChanges() {
        return this.operations.some(operation => operation.destructive);
    }

    destructiveChanges() {
        return this.operations.filter(operation => operation.destructive);
    }

    approve() {
        this.approved = true;
        return this;
    }

    async execute(options = {}) {
        if (!this._executor) {
            throw new Error("This migration plan is not attached to a Migration runner.");
        }
        return this._executor(this, options);
    }

    toJSON() {
        return {
            id: this.id,
            dialect: this.dialect,
            checksum: this.checksum,
            operations: this.operations,
            sql: this.sql,
            hasChanges: this.hasChanges(),
            destructive: this.hasDestructiveChanges()
        };
    }
}

module.exports = { MigrationPlan };
