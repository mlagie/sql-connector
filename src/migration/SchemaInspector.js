const { setSafe } = require("../utils/security/safe");

class SchemaInspector {
    constructor(connection, dialect) {
        this.connection = connection;
        this.dialect = dialect;
    }

    async query(sql, values = []) {
        return this.dialect.execute(this.connection, sql, values);
    }

    async inspect() {
        const queries = this.dialect.introspectionQueries();
        const tableRows = await this.query(queries.tables);

        const tables = {};

        for (const row of tableRows || []) {
            const tableName = row.table_name ?? row.TABLE_NAME;
            if (!tableName || tableName === "sql_connector_migrations") continue;

            const columnRows = await this.query(
                queries.columns,
                this.dialect.name === "postgres" ? [tableName] : [tableName]
            );
            setSafe(tables, tableName, {
                columns: Object.fromEntries(
                    (columnRows || []).map(row => {
                        const name = row.column_name ?? row.COLUMN_NAME;
                        return [name, this.dialect.normalizeDatabaseColumn(row)];
                    })
                )
            });
        }

        return {
            version: 1,
            tables
        };
    }
}

module.exports = { SchemaInspector };
