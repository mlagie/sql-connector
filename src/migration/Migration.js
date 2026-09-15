const { getConnexion } = require("../db/connexion");
const { getDialect: getConnectorDialect } = require("../db/dialects");
const { modelsToSnapshot, snapshotChecksum } = require("./SchemaSnapshot");
const { SchemaInspector } = require("./SchemaInspector");
const { SchemaDiffer } = require("./SchemaDiffer");
const { MigrationPlan } = require("./MigrationPlan");
const { MigrationStore } = require("./MigrationStore");
const { BackupManager } = require("./BackupManager");
const { MigrationRunner } = require("./MigrationRunner");
const { createDialect } = require("./dialects");
const { migrationId, stableStringify, sha256 } = require("./utils");

function resolveDialect(name) {
    if (name) return createDialect(name);

    try {
        const connectorDialect = getConnectorDialect();
        if (connectorDialect?.name) return createDialect(connectorDialect.name);
    } catch {}

    return createDialect("mysql");
}

function resolveModels(models) {
    if (Array.isArray(models)) return models;

    try {
        const { Model } = require("../models/Model");
        return Model.pendingModels || [];
    } catch {
        return [];
    }
}

class Migration {
    constructor(options = {}) {
        this.connection = options.connection || getConnexion();
        if (!this.connection) {
            throw new Error("No database connection. Call connect() before using migrations.");
        }

        this.dialect = options.dialect && typeof options.dialect.execute === "function"
            ? options.dialect
            : resolveDialect(options.dialect);

        this.models = resolveModels(options.models);
        this.store = options.store || new MigrationStore({
            directory: options.directory || "migrations",
            backupDirectory: options.backupDirectory,
            encryptionKey: options.encryptionKey,
            retention: options.retention
        });

        this.inspector = new SchemaInspector(this.connection, this.dialect);
        this.differ = new SchemaDiffer({
            allowDestructiveChanges: options.allowDestructiveChanges,
            allowDropTables: options.allowDropTables
        });
        this.backupManager = new BackupManager(
            this.connection,
            this.dialect,
            this.store
        );
        this.runner = new MigrationRunner({
            connection: this.connection,
            dialect: this.dialect,
            store: this.store,
            backupManager: this.backupManager
        });
    }

    async plan(options = {}) {
        if (options.models) this.models = options.models;

        const desired = modelsToSnapshot(this.models);
        const current = await this.inspector.inspect();

        const previous = await this.store.readSnapshot();
        const baseline = previous || current;

        const differ = new SchemaDiffer({
            allowDestructiveChanges: options.allowDestructiveChanges ?? false,
            allowDropTables: options.allowDropTables ?? false
        });

        // The DB is the safety check; the snapshot is used as history.
        const operations = differ.diff(desired, current);

        const sql = operations
            .map(operation => this.runner.sqlForOperation(operation))
            .join("\n");

        const id = options.id || migrationId(options.name || "schema");
        const checksum = sha256(stableStringify({
            id,
            dialect: this.dialect.name,
            operations,
            sql
        }));

        return new MigrationPlan({
            id,
            operations,
            sql,
            snapshot: desired,
            previousSnapshot: baseline,
            dialect: this.dialect,
            checksum,
            executor: (migrationPlan, executeOptions = {}) => this.runner.execute(
                migrationPlan,
                executeOptions
            )
        });
    }

    async migrate(options = {}) {
        const plan = await this.plan(options);

        if (!plan.hasChanges()) {
            return { applied: false, plan };
        }

        if (options.approve !== false) plan.approve();

        return this.runner.execute(plan, {
            requireApproval: options.requireApproval ?? true,
            allowDestructiveChanges: options.allowDestructiveChanges ?? false
        });
    }

    async status() {
        return this.runner.applied();
    }

    async cleanup() {
        return this.store.cleanup();
    }

    static async plan(options = {}) {
        return new Migration(options).plan(options);
    }

    static async migrate(options = {}) {
        return new Migration(options).migrate(options);
    }

    static async status(options = {}) {
        return new Migration(options).status();
    }
}

module.exports = { Migration };
