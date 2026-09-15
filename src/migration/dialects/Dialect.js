const { quoteIdentifier } = require("../utils");

class Dialect {
    constructor(name, options = {}) {
        this.name = name;
        this.quote = options.quote;
        this.capabilities = {
            transactionalDDL: false,
            renameColumn: true,
            alterColumn: true,
            ...options.capabilities
        };
    }

    escape(name) {
        return quoteIdentifier(name, this.quote);
    }

    placeholder() {
        return "?";
    }

    placeholders(count) {
        return Array.from({ length: count }, (_, i) => this.placeholder(i)).join(", ");
    }

    execute() {
        throw new Error(`${this.name} dialect must implement execute().`);
    }

    async begin() {}
    async commit() {}
    async rollback() {}

    mapType() {
        throw new Error(`${this.name} dialect must implement mapType().`);
    }

    columnDefinition() {
        throw new Error(`${this.name} dialect must implement columnDefinition().`);
    }

    createTable() {
        throw new Error(`${this.name} dialect must implement createTable().`);
    }

    addColumn(table, name, field) {
        return `ALTER TABLE ${this.escape(table)} ADD COLUMN ${this.columnDefinition(name, field)};`;
    }

    renameColumn(table, oldName, newName) {
        return `ALTER TABLE ${this.escape(table)} RENAME COLUMN ${this.escape(oldName)} TO ${this.escape(newName)};`;
    }

    alterColumn() {
        throw new Error(`${this.name} does not implement alterColumn().`);
    }

    dropColumn(table, name) {
        return `ALTER TABLE ${this.escape(table)} DROP COLUMN ${this.escape(name)};`;
    }

    dropTable(table) {
        return `DROP TABLE ${this.escape(table)};`;
    }

    introspectionQueries() {
        throw new Error(`${this.name} dialect must implement introspectionQueries().`);
    }

    normalizeDatabaseColumn(row) {
        return row;
    }

    normalizeDatabaseTable(row) {
        return row;
    }

    createMigrationTable() {
        throw new Error(`${this.name} dialect must implement createMigrationTable().`);
    }

    insertMigration() {
        throw new Error(`${this.name} dialect must implement insertMigration().`);
    }

    selectMigrations() {
        throw new Error(`${this.name} dialect must implement selectMigrations().`);
    }

    deleteMigration() {
        throw new Error(`${this.name} dialect must implement deleteMigration().`);
    }

    async transaction(connection, callback) {
        if (!this.capabilities.transactionalDDL) return callback();

        await this.begin(connection);
        try {
            const result = await callback();
            await this.commit(connection);
            return result;
        } catch (error) {
            try {
                await this.rollback(connection);
            } catch {}
            throw error;
        }
    }
}

module.exports = { Dialect };
