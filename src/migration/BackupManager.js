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

        for (const table of tables) {
            // Backup is intentionally data-oriented rather than DB-specific SQL.
            // The encrypted file can be inspected/restored by a dedicated tool later.
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
