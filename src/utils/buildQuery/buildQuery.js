const { getDialect } = require("../../db/dialects");
const { escapeOrderDirection } = require("../sql");
const count = require("./count");

function buildGroupByItem(group) {
    let sql;
    if (typeof group !== 'string' && typeof group !== 'object') {
        throw new Error("Group by items must be strings or objects");
    }
    if (typeof group === 'object') {
        if (group.dateFormat) {
            const [col, format] = group.dateFormat;
            sql = `DATE_FORMAT(${getDialect().escape(col)}, ${getDialect().escapeValue(format)})`;
        }
        if (group.col) {
            sql = getDialect().escape(group.col);
        }
        if (group.as) {
            sql += ` AS ${getDialect().escape(group.as)}`;
        }
        return sql;
    }

    return getDialect().escape(group.trim());
}

function buildField(field) {
    if (typeof field === 'string') {
        if (field === "*") return "*";
        return getDialect().escape(field);
    }

    let sql = '';

    if (field.sum)
        sql = `SUM(${getDialect().escape(field.sum)})`;
    else if (field.dateFormat) {
        const [col, format] = field.dateFormat;
        sql = `DATE_FORMAT(${getDialect().escape(col)}, ${getDialect().escapeValue(format)})`;
    }
    else if (field.col)
        sql = getDialect().escape(field.col);
    else if (field.distinct)
        sql = `DISTINCT ${getDialect().escape(field.distinct)}`;
    else if (field.count)
        sql = count(field.count);
    if (field.as)
        sql += ` AS ${getDialect().escape(field.as)}`;
    else if (field.sum)
        sql += ` AS ${getDialect().escape(field.sum)}`;
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

const COMPARISON_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "NOT LIKE", "ILIKE", "NOT ILIKE", "IN", "NOT IN", "BETWEEN", "NOT BETWEEN"];

function buildCaseInsensitiveLike(dialect, key, placeholder, negate) {
    if (dialect.name === "postgres") return null;
    return `${negate ? "NOT " : ""}LOWER(${dialect.escape(key)}) LIKE LOWER(${placeholder})`;
}

function buildWhere(where, values, offset) {
    const conditions = [];

    for (const [key, value] of Object.entries(where)) {
        if (key === "OR") {
            if (value.length === 0) {
                throw new Error("OR conditions cannot be empty");
            }
            const clauses = value
                .map((item) => buildWhere(item, values, offset))
                .filter(Boolean);

            if (clauses.length) {
                conditions.push(`(${clauses.join(" OR ")})`);
            }

            continue;
        }

        if (key === "AND") {
            if (value.length === 0) {
                throw new Error("AND conditions cannot be empty");
            }
            const clauses = value
                .map((item) => buildWhere(item, values, offset))
                .filter(Boolean);

            if (clauses.length) {
                conditions.push(`(${clauses.join(" AND ")})`);
            }

            continue;
        }

        if (key === "NOT") {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new Error("NOT condition must be an object");
            }
            const clause = buildWhere(value, values, offset);
            if (clause) conditions.push(`NOT (${clause})`);
            continue;
        }

        if (value && typeof value === "object" && !Array.isArray(value)) {
            const operators = Object.keys(value);

            const isOperatorObject = operators.some((op) => COMPARISON_OPERATORS.includes(op));

            if (isOperatorObject) {
                const dialect = getDialect();

                for (const [operator, operatorValue] of Object.entries(value)) {
                    if (operator === "IN" || operator === "NOT IN") {
                        const placeholders = operatorValue
                            .map((_, i) => dialect.getPlaceholder(offset + values.length + i))
                            .join(",");

                        conditions.push(`${dialect.escape(key)} ${operator} (${placeholders})`);
                        values.push(...operatorValue);
                    } else if (operator === "BETWEEN" || operator === "NOT BETWEEN") {
                        const [min, max] = operatorValue;
                        const lowPlaceholder = dialect.getPlaceholder(offset + values.length);
                        const highPlaceholder = dialect.getPlaceholder(offset + values.length + 1);

                        conditions.push(`${dialect.escape(key)} ${operator} ${lowPlaceholder} AND ${highPlaceholder}`);
                        values.push(min, max);
                    } else if (operator === "ILIKE" || operator === "NOT ILIKE") {
                        const placeholder = dialect.getPlaceholder(offset + values.length);
                        const negate = operator === "NOT ILIKE";
                        const fallback = buildCaseInsensitiveLike(dialect, key, placeholder, negate);

                        conditions.push(fallback ?? `${dialect.escape(key)} ${operator} ${placeholder}`);
                        values.push(operatorValue);
                    } else if (operatorValue === null && (operator === "=" || operator === "!=")) {
                        conditions.push(`${dialect.escape(key)} IS ${operator === "!=" ? "NOT " : ""}NULL`);
                    } else {
                        conditions.push(`${dialect.escape(key)} ${operator} ${dialect.getPlaceholder(offset + values.length)}`);
                        values.push(operatorValue);
                    }
                }
                continue;
            }
        }

        if (value === null) {
            conditions.push(`${getDialect().escape(key)} IS NULL`);
            continue;
        }

        conditions.push(`${getDialect().escape(key)} = ${getDialect().getPlaceholder(offset + values.length)}`);
        values.push(value);
    }

    return conditions.join(" AND ");
}

/**
 * Construit les parties de la requête et extrait les valeurs sécurisées
 * @param {Object} options Options de filtrage, tri et pagination
 * @param {number} [valueOffset=0] Décalage d'index pour les placeholders (utile quand des valeurs ont déjà été liées avant le WHERE, ex: SET d'un UPDATE)
 * @returns {Object} Un objet contenant la chaîne SQL générée et le tableau des valeurs { sql, values }
 */
function buildQueryParts(options, valueOffset = 0) {
    const parts = [];
    const values = [];

    if (!options) {
        return { sql: '', values: [] };
    }
    if (options.where) {
        if (typeof options.where !== 'object' || Array.isArray(options.where)) {
            throw new Error("Raw string WHERE clauses are not allowed. Use a structured filter instead.");
        }
        parts.push(`WHERE ${buildWhere(options.where, values, valueOffset)}`);
    }

    if (options.groupBy) {
        parts.push(`GROUP BY ${options.groupBy.map(group => buildGroupByItem(group)).join(', ')}`);
    }

    if (options.having) {
        if (typeof options.having !== 'object' || Array.isArray(options.having)) {
            throw new Error("Raw string HAVING clauses are not allowed. Use a structured filter instead.");
        }
        parts.push(`HAVING ${buildWhere(options.having, values, valueOffset)}`);
    }

    if (options.orderBy) {
        const order = options.orderBy.map(o =>
            typeof o === 'string'
                ? getDialect().escape(o)
                : `${getDialect().escape(o.field)} ${escapeOrderDirection(o.direction || 'ASC')}`
        );
        parts.push(`ORDER BY ${order.join(', ')}`);
    }

    if (options.limit) {
        if (!Number.isInteger(options.limit) || options.limit < 0) {
            throw new Error("Invalid LIMIT value");
        }

        parts.push(`LIMIT ${getDialect().getPlaceholder(valueOffset + values.length)}`);
        values.push(options.limit);
    }

    if (options.offset !== undefined) {
        if (!Number.isInteger(options.offset) || options.offset < 0) {
            throw new Error("Invalid OFFSET value");
        }

        parts.push(`OFFSET ${getDialect().getPlaceholder(valueOffset + values.length)}`);
        values.push(options.offset);
    }

    return {
        sql: parts.join('\n\n'),
        values: values
    };
}

module.exports = { buildQueryParts, buildSelect };