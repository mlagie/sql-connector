# API reference

## Table of contents

1. [Root exports](#root-exports)
2. [Connection](#connection)
3. [Schema](#schema)
4. [Model](#model)
5. [ModelInstance](#modelinstance)
6. [Migration](#migration)
7. [MigrationPlan](#migrationplan)
8. [MigrationStore](#migrationstore)
9. [MigrationRunner](#migrationrunner)
10. [SchemaDiffer](#schemadiffer)
11. [SchemaInspector](#schemainspector)
12. [Dialect classes](#dialect-classes)

## Root exports

```js
const api = require('@mlagie/sql-connector');
```

Exports:

```text
client
connect
logout
Schema
Model
ModelInstance
sqlTypeMap
Migration
MigrationPlan
MigrationStore
MigrationRunner
SchemaDiffer
SchemaInspector
MySQLDialect
PostgreSQLDialect
MigrationError
DestructiveMigrationError
MigrationChecksumError
```

## Connection

### `connect(config, dialect?)`

Connects to MySQL by default or PostgreSQL when `dialect` is `postgres`.

### `logout()`

Closes the active connector connection.

## Schema

### `new Schema(schemaDict)`

Stores a declarative table schema.

Property:

- `schemaDict` — field definitions.

## Model

### `new Model(name, schema)`

Creates a model for a table.

### `Model.syncAllTables()`

Creates all pending model tables in dependency order.

### `model.save(data)`

Inserts a row.

### `model.find(options?)`

Returns `ModelInstance[]` using structured filters and query options.

### `model.count(filter?)`

Returns the number of matching rows.

### `model.delete(filter)`

Deletes matching rows and returns the affected-row status used by the model API.

### `model.dropTable()`

Drops the model table.

### `model.generate_uuid(column?)`

Generates a unique UUID for a column, defaulting to `uuid`.

### `model.customRequest(sql)`

Executes trusted raw SQL.

## ModelInstance

### `instance.updateOne(data)`

Updates the loaded row, preferring primary-key fields from its schema when available.

### `instance.delete(filter?)`

Deletes the current row or the supplied filter.

### `instance.customRequest(sql)`

Executes trusted raw SQL and wraps returned data.

### `instance.getRecordData()`

Returns the underlying record data.

### `instance.toJSON()`

Returns record data for JSON serialization.

## Migration

### `new Migration(options?)`

Options include:

- `connection`;
- `dialect`;
- `models`;
- `directory`;
- `backupDirectory`;
- `encryptionKey`;
- `retention`;
- `allowDestructiveChanges`;
- `allowDropTables`.

Methods:

- `plan(options?)`;
- `migrate(options?)`;
- `status()`;
- `cleanup()`.

Static methods:

- `Migration.plan(options?)`;
- `Migration.migrate(options?)`;
- `Migration.status(options?)`.

## MigrationPlan

Properties:

- `id`;
- `operations`;
- `sql`;
- `snapshot`;
- `previousSnapshot`;
- `dialect`;
- `checksum`;
- `approved`.

Methods:

- `hasChanges()`;
- `hasDestructiveChanges()`;
- `destructiveChanges()`;
- `approve()`;
- `execute(options?)`;
- `toJSON()`.

## MigrationStore

Constructor options:

- `directory`;
- `backupDirectory`;
- `encryptionKey`;
- `retention`.

Methods:

- `ensureDirectories()`;
- `writeMigration(plan)`;
- `writeBackup(name, content)`;
- `cleanup()`;
- `writeSnapshot(snapshot)`;
- `readSnapshot()`;
- `listMigrationFiles()`;
- `validateChecksum(actual, expected)`.

## MigrationRunner

Methods:

- `ensureMigrationTable()`;
- `applied()`;
- `execute(plan, options?)`;
- `sqlForOperation(operation)`.

## SchemaDiffer

Constructor options:

- `allowDestructiveChanges`;
- `allowDropTables`.

### `diff(desired, current)`

Returns migration operations.

## SchemaInspector

### `inspect()`

Returns the normalized database schema snapshot used by the migration planner.

## Migration errors

### `MigrationError`

Base migration error with a `code` and optional `details`.

### `DestructiveMigrationError`

Raised when a destructive schema operation is not explicitly authorized.

### `MigrationChecksumError`

Raised when a migration checksum does not match the expected value.

## Dialect classes

`MySQLDialect` and `PostgreSQLDialect` implement migration-specific SQL generation and introspection.
