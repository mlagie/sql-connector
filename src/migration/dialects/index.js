const { MySQLDialect } = require("./MySQLDialect");
const { PostgreSQLDialect } = require("./PostgreSQLDialect");

function createDialect(name) {
    switch (String(name || "mysql").toLowerCase()) {
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
    createDialect,
    MySQLDialect,
    PostgreSQLDialect
};
