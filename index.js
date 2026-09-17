const { Model } = require("./src/models/Model");
const { ModelInstance } = require("./src/models/ModelInstance");
const { connect, logout } = require("./src/db/connect");
const {Schema} = require("./src/models/Schema");
const { sqlTypeMap } = require("./src/utils/sqlTypeMap");
const {
    Migration,
    MigrationPlan,
    MigrationStore,
    MigrationRunner,
    SchemaDiffer,
    SchemaInspector,
    MySQLDialect,
    PostgreSQLDialect
} = require("./src/migration");
const { MigrationError, DestructiveMigrationError, MigrationChecksumError } = require("./src/migration/errors");

let client = {};

module.exports = {
    client,
    connect,
    logout,
    Schema,
    Model,
    ModelInstance,
    sqlTypeMap,
    Migration,
    MigrationPlan,
    MigrationStore,
    MigrationRunner,
    SchemaDiffer,
    SchemaInspector,
    MySQLDialect,
    PostgreSQLDialect,
    MigrationError,
    DestructiveMigrationError,
    MigrationChecksumError
};
