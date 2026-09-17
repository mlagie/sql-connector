const { Migration } = require("./Migration");
const { MigrationPlan } = require("./MigrationPlan");
const { MigrationStore } = require("./MigrationStore");
const { MigrationRunner } = require("./MigrationRunner");
const { SchemaDiffer } = require("./SchemaDiffer");
const { SchemaInspector } = require("./SchemaInspector");
const { MySQLDialect, PostgreSQLDialect } = require("./dialects");

module.exports = {
    Migration,
    MigrationPlan,
    MigrationStore,
    MigrationRunner,
    SchemaDiffer,
    SchemaInspector,
    MySQLDialect,
    PostgreSQLDialect
};
