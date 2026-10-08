// src/db/dialects.js
const mysql = require('mysql2');
const { normalizeType } = require("../migration/utils");
const { getSafe } = require("../utils/security/safe");

// Ta regex de validation existante (ex: /^[a-zA-Z_][a-zA-Z0-9_]*$/)
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function normalizeIdentifierPart(part) {
    return part ? part.trim() : "";
}

// Fonction maîtresse calquée sur ta logique de sécurité
function secureEscape(identifier, escapeFn) {
    if (identifier === "*") return "*";

    if (typeof identifier !== "string" || identifier.length === 0) {
        throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return identifier.split(".").map(part => {
        const normalizedPart = normalizeIdentifierPart(part);

        if (normalizedPart === "*") return "*";
        if (!SAFE_IDENTIFIER.test(normalizedPart)) {
            throw new Error(`Invalid SQL identifier: ${identifier}`);
        }
        // On applique l'échappement propre au dialecte
        return escapeFn(normalizedPart);
    }).join(".");
}

function escapeIdentifierList(identifiers) {
    return identifiers.map(identifier => secureEscape(identifier, (part) => part)).join(", ");
}

function isDateLikeType(fieldType) {
    return ["date", "datetime", "timestamp", "now", "time", "year"].includes(String(fieldType ?? "").toLowerCase());
}

function isSqlTemporalDefault(defaultValue) {
    if (typeof defaultValue !== "string") return false;

    const normalizedValue = defaultValue.trim().toUpperCase();
    return ["CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP()", "NOW", "NOW()"].includes(normalizedValue);
}

function formatDateDefault(defaultValue, quote) {
    const formattedDate = defaultValue.toISOString().slice(0, 19).replace("T", " ");
    return `DEFAULT ${quote}${formattedDate}${quote}`;
}

function formatStringDefault(defaultValue, quote) {
    const escapedValue = quote === "'"
        ? String(defaultValue).replace(/'/g, "''")
        : String(defaultValue).replace(/"/g, '""');
    return `DEFAULT ${quote}${escapedValue}${quote}`;
}

function formatPostgresDateFormat(format) {
    return String(format)
        .replace(/%Y/g, "YYYY")
        .replace(/%m/g, "MM")
        .replace(/%d/g, "DD")
        .replace(/%H/g, "HH24")
        .replace(/%i/g, "MI")
        .replace(/%s/g, "SS");
}

const MYSQL_TYPE_MAP = {
    String: "VARCHAR",
    Char: "CHAR",
    Number: "INT",
    SmallInt: "SMALLINT",
    BigInt: "BIGINT",
    Decimal: "DECIMAL",
    Boolean: "BOOLEAN",
    Date: "DATETIME",
    Object: "JSON",
    Array: "VARCHAR",
    Now: "NOW()",
    Float: "FLOAT",
    Double: "DOUBLE",
    Text: "TEXT",
    Blob: "BLOB",
    Binary: "VARBINARY",
    Uuid: "CHAR",
    DateTime: "DATETIME",
    Timestamp: "TIMESTAMP",
    CurrentTimestamp: "CURRENT_TIMESTAMP"
};

const POSTGRES_TYPE_MAP = {
    ...MYSQL_TYPE_MAP,
    Date: "TIMESTAMP",
    Object: "JSONB",
    Now: "TIMESTAMP",
    Float: "REAL",
    Double: "DOUBLE PRECISION",
    Blob: "BYTEA",
    Binary: "BYTEA",
    Uuid: "UUID",
    DateTime: "TIMESTAMP",
    Timestamp: "TIMESTAMP",
    CurrentTimestamp: "TIMESTAMP"
};

const dialects = {
    mysql: {
        name: "mysql",
        mapType: (fieldType) => getSafe(MYSQL_TYPE_MAP, fieldType),
        // Sécurisé avec ta validation + mysql.escapeId natif
        escape: (identifier) => secureEscape(identifier, (part) => mysql.escapeId(part)),
        escapeValue: (value) => mysql.escape(value),
        escapeIdentifierList: (identifiers) => escapeIdentifierList(identifiers),
        getPlaceholder: () => "?",
        tableSuffix: " ENGINE=InnoDB",
        autoIncrement: () => "AUTO_INCREMENT",
        columnType: (type, length) => `${type}${length ? `(${length})` : ""}`,
        dateFormat: (column, format) => `DATE_FORMAT(${column}, ${dialects.mysql.escapeValue(format)})`,
        caseInsensitiveLike: (column, placeholder, negate) => `${negate ? "NOT " : ""}LOWER(${column}) LIKE LOWER(${placeholder})`,
        uuidQuery: "SELECT UUID();",
        extractUuid: (rows) => rows?.[0]?.["UUID()"] ?? rows?.["UUID()"],
        countKey: (row) => row["COUNT(*)"] ?? row["count"] ?? Object.values(row)[0],
        formatDefaultSql: (defaultValue, fieldType) => {
            if (defaultValue === undefined) return null;
            if (defaultValue === null) return "DEFAULT NULL";
            if (typeof defaultValue === "function") {
                if (isDateLikeType(fieldType)) return "DEFAULT CURRENT_TIMESTAMP";
                return dialects.mysql.formatDefaultSql(defaultValue(), fieldType);
            }
            if (defaultValue instanceof Date) return formatDateDefault(defaultValue, "\"");
            if (isSqlTemporalDefault(defaultValue)) return "DEFAULT CURRENT_TIMESTAMP";
            if (typeof defaultValue === "string") return formatStringDefault(defaultValue, "\"");
            if (typeof defaultValue === "number" || typeof defaultValue === "bigint") return `DEFAULT ${defaultValue}`;
            if (typeof defaultValue === "boolean") return `DEFAULT ${defaultValue ? 1 : 0}`;
            if (typeof defaultValue === "object") return formatStringDefault(JSON.stringify(defaultValue), "\"");
            return formatStringDefault(defaultValue, "\"");
        },
        execute: async (conn, sql, values = []) => {
            const [rows] = await conn.promise().execute(sql, values);
            return rows;
        },
        getAffectedRows: (executeResult) => {
            return executeResult && executeResult.affectedRows !== undefined ? executeResult.affectedRows : 0;
        }
    },
    postgres: {
        name: "postgres",
        mapType: (fieldType) => getSafe(POSTGRES_TYPE_MAP, fieldType),
        // Sécurisé avec ta validation + standard ANSI SQL (double-quotes doublées pour l'échappement)
        escape: (identifier) => secureEscape(identifier, (part) => `"${part.replace(/"/g, '""')}"`),  
        escapeValue: (value) => {
            if (value === null) return 'NULL';
            if (typeof value === 'number') return value.toString();
            if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
            return `'${String(value).replace(/'/g, "''")}'`;
        },
        escapeIdentifierList: (identifiers) => escapeIdentifierList(identifiers),
        getPlaceholder: (index) => `$${index + 1}`,
        tableSuffix: "",
        autoIncrement: (fieldType) => {
            if (!["Number", "SmallInt", "BigInt"].includes(fieldType)) {
                throw new Error(`PostgreSQL auto-increment is unsupported for type ${fieldType}.`);
            }
            return "GENERATED BY DEFAULT AS IDENTITY";
        },
        columnType: (type, length) => `${type}${type === "INT" ? "" : (length ? `(${length})` : "")}`,
        dateFormat: (column, format) => `TO_CHAR(${column}, ${dialects.postgres.escapeValue(formatPostgresDateFormat(format))})`,
        caseInsensitiveLike: (column, placeholder, negate) => `${column} ${negate ? "NOT " : ""}ILIKE ${placeholder}`,
        uuidQuery: "SELECT gen_random_uuid() AS uuid;",
        extractUuid: (rows) => rows?.[0]?.uuid || rows?.uuid,
        countKey: (row) => row["count"] ?? Object.values(row)[0],
        formatDefaultSql: (defaultValue, fieldType) => {
            if (defaultValue === undefined) return null;
            if (defaultValue === null) return "DEFAULT NULL";
            if (typeof defaultValue === "function") {
                if (isDateLikeType(fieldType)) return "DEFAULT CURRENT_TIMESTAMP";
                return dialects.postgres.formatDefaultSql(defaultValue(), fieldType);
            }
            if (defaultValue instanceof Date) return formatDateDefault(defaultValue, "'");
            if (isSqlTemporalDefault(defaultValue)) return "DEFAULT CURRENT_TIMESTAMP";
            if (typeof defaultValue === "string") return formatStringDefault(defaultValue, "'");
            if (typeof defaultValue === "number" || typeof defaultValue === "bigint") return `DEFAULT ${defaultValue}`;
            if (typeof defaultValue === "boolean") return `DEFAULT ${defaultValue ? "TRUE" : "FALSE"}`;
            if (typeof defaultValue === "object") return formatStringDefault(JSON.stringify(defaultValue), "'");
            return formatStringDefault(defaultValue, "'");
        },
        execute: async (client, sql, values = []) => {
            let pgSql = sql;
            if (sql.includes('?')) {
                let counter = 1;
                pgSql = sql.replace(/\?/g, () => `$${counter++}`);
            }
            const result = await client.query(pgSql, values);
            const rows = result.rows || [];
            rows.rowCount = result.rowCount;
            return rows;
        },
        getAffectedRows: (executeResult) => {
            return executeResult && executeResult.rowCount !== undefined ? executeResult.rowCount : 0;
        }
    }
};

// Migration dialects live in this module too, so SQL escaping, connection execution
// and schema migration share one source of truth.

const { quoteIdentifier } = require("../migration/utils");

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
        const rawType = normalizeType(field);
        const type = String(rawType || "").toUpperCase();
        const length = field.length || 255;

        switch (type) {
            case "STRING":
            case "VARCHAR":
                return `VARCHAR(${length})`;
            case "CHAR":
                return `CHAR(${length})`;
            case "TEXT":
                return "TEXT";
            case "NUMBER":
            case "INT":
            case "INTEGER":
                return "INT";
            case "SMALLINT":
                return "SMALLINT";
            case "MEDIUMINT":
                return "MEDIUMINT";
            case "BIGINT":
                return "BIGINT";
            case "DECIMAL":
            case "NUMERIC":
                return "DECIMAL";
            case "FLOAT":
                return "DOUBLE";
            case "DOUBLE":
                return "DOUBLE";
            case "BOOLEAN":
            case "BOOL":
            case "TINYINT":
                return "BOOLEAN";
            case "DATE":
                return "DATE";
            case "DATETIME":
            case "TIMESTAMP":
            case "NOW":
            case "CURRENTTIMESTAMP":
                return "DATETIME";
            case "OBJECT":
            case "JSON":
                return "JSON";
            case "BLOB":
                return "BLOB";
            case "VARBINARY":
            case "BINARY":
                return "VARBINARY";
            default:
                throw new Error(`Unsupported MySQL type: ${rawType}`);
        }
    }

    defaultSql(value) {
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




class PostgreSQLDialect extends Dialect {
    constructor() {
        super("postgres", {
            quote: '"',
            capabilities: {
                transactionalDDL: true,
                renameColumn: true,
                alterColumn: true
            }
        });
    }

    placeholder(index) {
        return `$${index + 1}`;
    }

    execute(connection, sql, values = []) {
        if (typeof connection.query === "function") {
            return connection.query(sql, values).then(result => result.rows);
        }
        throw new Error("PostgreSQL connection does not expose query().");
    }

    mapType(field) {
        const rawType = normalizeType(field);
        const type = String(rawType || "").toUpperCase();
        const length = field.length || 255;

        switch (type) {
            case "STRING":
            case "VARCHAR":
            case "CHARACTER VARYING":
                return `VARCHAR(${length})`;
            case "CHAR":
            case "BPCHAR":
            case "CHARACTER":
                return `CHAR(${length})`;
            case "TEXT":
                return "TEXT";
            case "NUMBER":
            case "INT":
            case "INT4":
            case "INTEGER":
                return "INTEGER";
            case "SMALLINT":
            case "INT2":
                return "SMALLINT";
            case "BIGINT":
            case "INT8":
                return "BIGINT";
            case "DECIMAL":
            case "NUMERIC":
                return "DECIMAL";
            case "FLOAT":
            case "FLOAT4":
            case "REAL":
                return "REAL";
            case "DOUBLE":
            case "FLOAT8":
            case "DOUBLE PRECISION":
                return "DOUBLE PRECISION";
            case "BOOLEAN":
            case "BOOL":
                return "BOOLEAN";
            case "DATE":
                return "DATE";
            case "DATETIME":
            case "TIMESTAMP":
            case "NOW":
            case "CURRENTTIMESTAMP":
                return "TIMESTAMP";
            case "TIMESTAMPTZ":
            case "TIMESTAMP WITH TIME ZONE":
                return "TIMESTAMPTZ";
            case "OBJECT":
            case "JSON":
            case "JSONB":
                return "JSONB";
            case "UUID":
                return "UUID";
            default:
                throw new Error(`Unsupported PostgreSQL type: ${rawType}`);
        }
    }

    defaultSql(value) {
        if (value === undefined) return "";
        if (value === null) return "DEFAULT NULL";
        if (typeof value === "number") return `DEFAULT ${value}`;
        if (typeof value === "boolean") return `DEFAULT ${value ? "TRUE" : "FALSE"}`;
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
        if (field.default !== undefined) sql += ` ${this.defaultSql(field.default)}`;
        if (field.unique) sql += " UNIQUE";
        if (field.primary_key) sql += " PRIMARY KEY";
        if (field.auto_increment) {
            // Explicit auto-increment is represented with identity syntax.
            sql = sql.replace(/\s+(INTEGER|BIGINT|SMALLINT)(?=\s|$)/i, " $1 GENERATED BY DEFAULT AS IDENTITY");
        }
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
        const clauses = [
            `ALTER COLUMN ${this.escape(name)} TYPE ${this.mapType(field)}`
        ];

        if (field.required || field.primary_key) {
            clauses.push(`ALTER COLUMN ${this.escape(name)} SET NOT NULL`);
        } else {
            clauses.push(`ALTER COLUMN ${this.escape(name)} DROP NOT NULL`);
        }

        if (field.default === undefined) {
            clauses.push(`ALTER COLUMN ${this.escape(name)} DROP DEFAULT`);
        } else {
            clauses.push(`ALTER COLUMN ${this.escape(name)} SET ${this.defaultSql(field.default)}`);
        }

        return `ALTER TABLE ${this.escape(table)} ${clauses.join(", ")};`;
    }

    introspectionQueries() {
        return {
            tables: `
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = current_schema()
                  AND table_type = 'BASE TABLE'
            `,
            columns: `
                SELECT
                    column_name,
                    data_type,
                    udt_name,
                    is_nullable,
                    column_default,
                    character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = $1
                ORDER BY ordinal_position
            `
        };
    }

    normalizeDatabaseColumn(row) {
        const type = String(row.udt_name || row.data_type || "").toLowerCase();
        const isSerial = typeof row.column_default === "string" &&
            row.column_default.includes("nextval(");

        return {
            type,
            length: row.character_maximum_length ?? undefined,
            required: row.is_nullable === "NO",
            primary_key: false,
            unique: false,
            auto_increment: isSerial,
            default: row.column_default
        };
    }

    createMigrationTable() {
        return `
            CREATE TABLE IF NOT EXISTS ${this.escape("sql_connector_migrations")} (
                ${this.escape("id")} VARCHAR(255) NOT NULL PRIMARY KEY,
                ${this.escape("checksum")} VARCHAR(64) NOT NULL,
                ${this.escape("applied_at")} TIMESTAMPTZ NOT NULL,
                ${this.escape("created_at")} TIMESTAMPTZ NOT NULL
            );
        `;
    }

    insertMigration() {
        return `
            INSERT INTO ${this.escape("sql_connector_migrations")}
            (${this.escape("id")}, ${this.escape("checksum")}, ${this.escape("applied_at")}, ${this.escape("created_at")})
            VALUES ($1, $2, $3, $4)
        `;
    }

    selectMigrations() {
        return `SELECT ${this.escape("id")} AS id, ${this.escape("checksum")} AS checksum, ${this.escape("applied_at")} AS applied_at FROM ${this.escape("sql_connector_migrations")} ORDER BY ${this.escape("id")}`;
    }

    deleteMigration() {
        return `DELETE FROM ${this.escape("sql_connector_migrations")} WHERE ${this.escape("id")} = $1`;
    }
}

let currentDialectName = "mysql";

function setGlobalDialect(dialectName) {
    if (dialectName !== "mysql" && dialectName !== "postgres") {
        throw new Error(`Unsupported dialect: ${dialectName}`);
    }
    currentDialectName = dialectName;
}

function getDialect() {
    switch (currentDialectName) {
        case "postgres":
            return dialects.postgres;
        case "mysql":
            return dialects.mysql;
    }
}

function createDialect(name) {
    switch (String(name || currentDialectName).toLowerCase()) {
        case "mysql":
        case "mariadb":
            return new MySQLDialect();
        case "postgres":
        case "postgresql":
            return new PostgreSQLDialect();
        default:
            throw new Error(`Unsupported migration dialect: ${name}`);
    }
}

module.exports = {
    getDialect,
    setGlobalDialect,
    createDialect,
    Dialect,
    MySQLDialect,
    PostgreSQLDialect
};
