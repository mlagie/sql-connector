const { Dialect } = require("./Dialect");
const { normalizeType } = require("../utils");

class MySQLDialect extends Dialect {
    constructor() {
        super("mysql", {
            quote: "`",
            capabilities: {
                transactionalDDL: false,
                renameColumn: true,
                alterColumn: true
            }
        });
    }

    placeholder() {
        return "?";
    }

    execute(connection, sql, values = []) {
        return connection.promise ? connection.promise().query(sql, values).then(([rows]) => rows)
            : new Promise((resolve, reject) => {
                connection.query(sql, values, (error, rows) => error ? reject(error) : resolve(rows));
            });
    }

    mapType(field) {
        const type = normalizeType(field);
        const length = field.length || 255;

        switch (type) {
            case "String":
            case "VARCHAR":
                return `VARCHAR(${length})`;
            case "Text":
                return "TEXT";
            case "Number":
            case "INT":
            case "Integer":
                return "INT";
            case "Float":
                return "DOUBLE";
            case "Boolean":
                return "BOOLEAN";
            case "Date":
                return "DATE";
            case "DateTime":
            case "Timestamp":
            case "Now":
            case "CurrentTimestamp":
                return "DATETIME";
            case "Object":
            case "JSON":
                return "JSON";
            default:
                throw new Error(`Unsupported MySQL type: ${type}`);
        }
    }

    defaultSql(value, field) {
        if (value === undefined) return "";
        if (value === null) return "DEFAULT NULL";
        if (typeof value === "number") return `DEFAULT ${value}`;
        if (typeof value === "boolean") return `DEFAULT ${value ? 1 : 0}`;
        if (typeof value === "string") {
            if (/^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME)\b/i.test(value)) {
                return `DEFAULT ${value}`;
            }
            return `DEFAULT '${value.replace(/'/g, "''")}'`;
        }
        return `DEFAULT '${String(value).replace(/'/g, "''")}'`;
    }

    columnDefinition(name, field) {
        if (field.primary_key && field.unique) {
            throw new Error(`Field '${name}' cannot be both PRIMARY KEY and UNIQUE.`);
        }

        let sql = `${this.escape(name)} ${this.mapType(field)}`;

        if (field.required || field.primary_key) sql += " NOT NULL";
        if (field.default !== undefined) sql += ` ${this.defaultSql(field.default, field)}`;
        if (field.unique) sql += " UNIQUE";
        if (field.auto_increment) sql += " AUTO_INCREMENT";
        if (field.primary_key) sql += " PRIMARY KEY";
        if (typeof field.customize === "string" && field.customize.trim()) {
            sql += ` ${field.customize.trim()}`;
        }

        return sql;
    }

    createTable(table, schema) {
        const columns = [];
        const foreignKeys = [];

        for (const [name, field] of Object.entries(schema)) {
            columns.push(this.columnDefinition(name, field));

            if (field.foreignKey) {
                const match = /^([A-Za-z_][A-Za-z0-9_$]*)(?:\s*\(\s*([A-Za-z_][A-Za-z0-9_$]*)\s*\)|\s*\.\s*([A-Za-z_][A-Za-z0-9_$]*)\s*)$/.exec(field.foreignKey);
                if (!match) throw new Error(`Invalid foreign key definition for ${name}.`);
                const refColumn = match[2] || match[3];
                foreignKeys.push(
                    `FOREIGN KEY (${this.escape(name)}) REFERENCES ${this.escape(match[1])} (${this.escape(refColumn)})`
                );
            }
        }

        return `CREATE TABLE IF NOT EXISTS ${this.escape(table)} (${columns.concat(foreignKeys).join(", ")});`;
    }

    alterColumn(table, name, field) {
        return `ALTER TABLE ${this.escape(table)} MODIFY COLUMN ${this.columnDefinition(name, field)};`;
    }

    introspectionQueries() {
        return {
            tables: `
                SELECT TABLE_NAME AS table_name
                FROM information_schema.tables
                WHERE table_schema = DATABASE()
                  AND table_type = 'BASE TABLE'
            `,
            columns: `
                SELECT
                    COLUMN_NAME AS column_name,
                    DATA_TYPE AS data_type,
                    COLUMN_TYPE AS column_type,
                    IS_NULLABLE AS is_nullable,
                    COLUMN_DEFAULT AS column_default,
                    COLUMN_KEY AS column_key,
                    EXTRA AS extra,
                    CHARACTER_MAXIMUM_LENGTH AS character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = ?
                ORDER BY ORDINAL_POSITION
            `
        };
    }

    normalizeDatabaseColumn(row) {
        const type = String(row.data_type || "").toLowerCase();
        return {
            type,
            length: row.character_maximum_length ?? undefined,
            required: row.is_nullable === "NO",
            primary_key: row.column_key === "PRI",
            unique: row.column_key === "UNI",
            auto_increment: String(row.extra || "").toLowerCase().includes("auto_increment"),
            default: row.column_default
        };
    }

    createMigrationTable() {
        return `
            CREATE TABLE IF NOT EXISTS ${this.escape("sql_connector_migrations")} (
                ${this.escape("id")} VARCHAR(191) NOT NULL PRIMARY KEY,
                ${this.escape("checksum")} VARCHAR(64) NOT NULL,
                ${this.escape("applied_at")} DATETIME NOT NULL,
                ${this.escape("created_at")} DATETIME NOT NULL
            );
        `;
    }

    insertMigration() {
        return `
            INSERT INTO ${this.escape("sql_connector_migrations")}
            (${this.escape("id")}, ${this.escape("checksum")}, ${this.escape("applied_at")}, ${this.escape("created_at")})
            VALUES (?, ?, ?, ?)
        `;
    }

    selectMigrations() {
        return `SELECT ${this.escape("id")} AS id, ${this.escape("checksum")} AS checksum, ${this.escape("applied_at")} AS applied_at FROM ${this.escape("sql_connector_migrations")} ORDER BY ${this.escape("id")}`;
    }

    deleteMigration() {
        return `DELETE FROM ${this.escape("sql_connector_migrations")} WHERE ${this.escape("id")} = ?`;
    }
}

module.exports = { MySQLDialect };
