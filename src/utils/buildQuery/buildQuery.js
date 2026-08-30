const formatObject = require("../formatObject");
const generateCondition = require("../generateCondition");
const { escapeIdentifier, escapeOrderDirection, escapeValue } = require("../sql");
const count = require("./count");

function buildGroupByItem(group) {
    if (typeof group !== 'string') {
        throw new Error("Group by items must be strings");
    }

    const trimmedGroup = group.trim();

    if (/^DATE_FORMAT\(/i.test(trimmedGroup)) {
        const match = trimmedGroup.match(/^DATE_FORMAT\(([^,]+),\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\)$/i);
        if (match) {
            const column = match[1].trim();
            const format = match[2].slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
            return `DATE_FORMAT(${escapeIdentifier(column)}, ${escapeValue(format)})`;
        }
    }

    return escapeIdentifier(trimmedGroup);
}

function buildField(field) {
    if (typeof field === 'string') {
        if (field === "*") return "*";
        return escapeIdentifier(field);
    }

    let sql = '';

    if (field.sum)
        sql = `SUM(${escapeIdentifier(field.sum)})`;
    else if (field.dateFormat) {
        const [col, format] = field.dateFormat;
        sql = `DATE_FORMAT(${escapeIdentifier(col)}, ${escapeValue(format)})`;
    }
    else if (field.col)
        sql = escapeIdentifier(field.col);
    else if (field.distinct)
        sql = `DISTINCT ${escapeIdentifier(field.distinct)}`;
    else if (field.count)
        sql = count(field.count);
    if (field.as)
        sql += ` AS ${escapeIdentifier(field.as)}`;
    else if (field.sum)
        sql += ` AS ${escapeIdentifier(field.sum)}`;
    return sql;
}

function buildSelect(select = []) {
    if (!select || select.length === 0) {
        return '*';
    }

    return select
        .map(field => buildField(field))
        .join(',\n');
}

function buildWhere(where, values = []) {
    const conditions = [];

    for (const [key, value] of Object.entries(where)) {
        if (key === "OR") {
            const clauses = value
                .map((item) => buildWhere(item, values))
                .filter(Boolean);

            if (clauses.length) {
                conditions.push(`(${clauses.join(" OR ")})`);
            }

            continue;
        }

        if (key === "AND") {
            const clauses = value
                .map((item) => buildWhere(item, values))
                .filter(Boolean);

            if (clauses.length) {
                conditions.push(`(${clauses.join(" AND ")})`);
            }

            continue;
        }

        if (value && typeof value === "object" && !Array.isArray(value)) {
            const operators = Object.keys(value);

            const isOperatorObject = operators.some((op) =>
                ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IN", "NOT IN"].includes(op)
            );

            if (isOperatorObject) {
                for (const [operator, operatorValue] of Object.entries(value)) {
                    if (operator === "IN" || operator === "NOT IN") {
                        const placeholders = operatorValue
                            .map(() => "?")
                            .join(",");

                        conditions.push(
                            `${key} ${operator} (${placeholders})`
                        );
                        values.push(...operatorValue);
                    } else {
                        conditions.push(`${key} ${operator} ?`);
                        values.push(operatorValue);
                    }
                }

                continue;
            }
        }

        conditions.push(`${key} = ?`);
        values.push(value);
    }

    return conditions.join(" AND ");
}

function buildQueryParts(options) {
    const parts = [];

    const values = [];

    if (options.where) {
        parts.push(`WHERE ${buildWhere(options.where, values)}`);
    }

    if (options.groupBy) {
        parts.push(`GROUP BY ${options.groupBy.map(group => buildGroupByItem(group)).join(', ')}`);
    }

    if (options.having) {
        throw new Error("Raw string HAVING clauses are not allowed. Use a structured filter instead.");
    }

    if (options.orderBy) {
        const order = options.orderBy.map(o =>
            typeof o === 'string'
                ? escapeIdentifier(o)
                : `${escapeIdentifier(o.field)} ${escapeOrderDirection(o.direction || 'ASC')}`
        );
        parts.push(`ORDER BY ${order.join(', ')}`);
    }

    if (options.limit) {
        if (!Number.isInteger(options.limit) || options.limit < 0) {
            throw new Error("Invalid LIMIT value");
        }
        parts.push(`LIMIT ${options.limit}`);
    }

    return parts.join('\n\n');
}

module.exports = { buildQueryParts, buildSelect }