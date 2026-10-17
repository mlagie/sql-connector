const { getDialect } = require("../../db/dialects");

module.exports = (aggregateType, field) => {
    if (typeof field === 'string') return `${aggregateType}(${getDialect().escape(field)})`;
    if (field instanceof Array && field !== null) return field.map(col => `${aggregateType}(${getDialect().escape(col)})`).join(' + ');
    if (field instanceof Object) {
        const [key, value] = Object.entries(field)[0];
        return `${aggregateType}(CASE WHEN ${getDialect().escape(key)} = ${getDialect().escapeValue(value)} THEN 1 END)`;
    }
    throw new Error(`Invalid field type for ${aggregateType}. Must be a string, array, or object.`);
}