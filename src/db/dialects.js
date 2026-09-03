// src/db/dialects.js
const mysql = require('mysql2');

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
    return ["date", "datetime", "timestamp", "now"].includes(String(fieldType ?? "").toLowerCase());
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

const dialects = {
    mysql: {
        name: "mysql",
        // Sécurisé avec ta validation + mysql.escapeId natif
        escape: (identifier) => secureEscape(identifier, (part) => mysql.escapeId(part)),
        escapeValue: (value) => mysql.escape(value),
        escapeIdentifierList: (identifiers) => escapeIdentifierList(identifiers),
        getPlaceholder: () => "?",
        tableSuffix: " ENGINE=InnoDB",
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

module.exports = { getDialect, setGlobalDialect };
