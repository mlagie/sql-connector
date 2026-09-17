const { setSafe } = require("../utils/security/safe");

class BackupManager {
    constructor(connection, dialect, store) {
        this.connection = connection;
        this.dialect = dialect;
        this.store = store;
    }

    async backupTables(tables, migrationId) {
        if (!this.store.retention || tables.length === 0) return null;

        const backup = {
            version: 1,
            createdAt: new Date().toISOString(),
            migrationId,
            tables: {}
        };

        const existing = await this.dialect.execute(
            this.connection,
            this.dialect.introspectionQueries().tables
        );
        const existingNames = new Set(existing.map(row => row.table_name));

        for (const table of tables) {
            // A table created by the migration does not exist yet and therefore
            // cannot be backed up. Rollback metadata will remove it if needed.
            if (!existingNames.has(table)) continue;

            const rows = await this.dialect.execute(
                this.connection,
                `SELECT * FROM ${this.dialect.escape(table)}`
            );
            setSafe(backup.tables, table, rows);
        }

        return this.store.writeBackup(migrationId, backup);
    }
}

module.exports = { BackupManager };
