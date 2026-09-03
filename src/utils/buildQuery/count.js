const { getDialect } = require("../../db/dialects");

module.exports = (field) => {
    if (typeof field === 'string') return `COUNT(${getDialect().escape(field)})`;
    if (field instanceof Array && field !== null) return field.map(col => `COUNT(${getDialect().escape(col)})`).join(' + ');
    if (field instanceof Object) {
        const [key, value] = Object.entries(field)[0];
        return `COUNT(CASE WHEN ${getDialect().escape(key)} = ${getDialect().escapeValue(value)} THEN 1 END)`;
    }
    throw new Error("Invalid field type for COUNT. Must be a string, array, or object.");
} 