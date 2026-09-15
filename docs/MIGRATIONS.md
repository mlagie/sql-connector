# Migration reference

## Table of contents

1. [Purpose](#purpose)
2. [Prerequisites](#prerequisites)
3. [Planning](#planning)
4. [Executing](#executing)
5. [Migration options](#migration-options)
6. [Operations](#operations)
7. [Renames](#renames)
8. [Destructive changes](#destructive-changes)
9. [Checksums and history](#checksums-and-history)
10. [Encrypted migration files](#encrypted-migration-files)
11. [Backups](#backups)
12. [Status and cleanup](#status-and-cleanup)
13. [Migration classes](#migration-classes)

## Purpose

The migration subsystem turns model schemas into controlled database schema changes.

It compares:

- the desired schema derived from `Model` objects;
- the schema currently reported by the active database dialect.

It then creates explicit operations and dialect-specific SQL.

## Prerequisites

Connect before constructing a migration unless an explicit connection is supplied:

```js
await connect(config, 'postgres');
const migration = new Migration();
```

For writing migration files, provide an encryption key through `encryptionKey` or `SQL_CONNECTOR_MIGRATION_KEY`.

## Planning

```js
const plan = await Migration.plan({
  name: 'users-schema',
});
```

The plan contains:

- `id`;
- `dialect`;
- `checksum`;
- `operations`;
- generated `sql`;
- desired snapshot;
- baseline snapshot.

Inspect it before execution:

```js
console.log(plan.toJSON());
console.log(plan.sql);
```

## Executing

Approval is required by default:

```js
const plan = await Migration.plan({ name: 'users-schema' });

if (plan.hasChanges()) {
  plan.approve();
  await plan.execute();
}
```

Or:

```js
await Migration.migrate({
  name: 'users-schema',
});
```

`Migration.migrate()` approves a changed plan by default and then executes it with the runner's approval checks enabled.

## Migration options

```js
new Migration({
  connection,
  dialect: 'mysql',
  models,
  directory: './migrations',
  backupDirectory: './migrations/backups',
  encryptionKey: process.env.SQL_CONNECTOR_MIGRATION_KEY,
  retention: '30d',
  allowDestructiveChanges: false,
  allowDropTables: false,
});
```

`retention` accepts milliseconds as a number or strings using `ms`, `s`, `m`, `h`, `d` and `w`.

## Operations

The differ can generate:

- `createTable`;
- `addColumn`;
- `renameColumn`;
- `alterColumn`;
- `dropColumn`;
- `dropTable`.

The first four are non-destructive in the differ's classification. `dropColumn` and `dropTable` are destructive.

## Renames

Declare a rename explicitly:

```js
const schema = new Schema({
  email_address: {
    type: String,
    length: 320,
    oldname: 'email',
  },
});
```

The differ checks that the old column exists and that the new name is not already occupied.

## Destructive changes

By default:

- dropping a column throws `DestructiveMigrationError`;
- dropping a table throws `DestructiveMigrationError`.

Allow them explicitly during planning and execution:

```js
const plan = await migration.plan({
  allowDestructiveChanges: true,
  allowDropTables: true,
});

plan.approve();

await plan.execute({
  allowDestructiveChanges: true,
});
```

Use these options deliberately in production workflows.

## Checksums and history

The runner creates `sql_connector_migrations` in the active database.

Each applied migration stores:

- migration id;
- SHA-256 checksum;
- applied timestamp;
- creation timestamp.

If an id already exists with a different checksum, execution fails rather than changing migration history silently.

## Encrypted migration files

After a successful migration, the desired schema snapshot is also persisted as `schema.snapshot.json`. Applied plans are written as encrypted files named:

```text
<directory>/<migration-id>.sql.enc
```

The encryption key is required to write these files.

```bash
export SQL_CONNECTOR_MIGRATION_KEY='a-long-random-secret'
```

The encryption implementation uses AES-256-GCM and a derived key.

## Backups

If retention is enabled, affected tables are selected before execution and stored as encrypted JSON:

```text
<backupDirectory>/<migration-id>.json.enc
```

```js
const migration = new Migration({
  encryptionKey: process.env.SQL_CONNECTOR_MIGRATION_KEY,
  retention: '30d',
});
```

Backups are data snapshots, not automatic rollback scripts. Restoration must be handled separately.

## Status and cleanup

```js
const migration = new Migration();
const status = await migration.status();
console.table(status);

await migration.cleanup();
```

`cleanup()` removes backup files older than the configured retention period.

## Migration classes

### `Migration`

High-level API for planning, applying, checking status and cleaning backups.

Methods:

- `plan(options)`;
- `migrate(options)`;
- `status()`;
- `cleanup()`.

Static equivalents:

- `Migration.plan(options)`;
- `Migration.migrate(options)`;
- `Migration.status(options)`.

### `MigrationPlan`

Methods:

- `hasChanges()`;
- `hasDestructiveChanges()`;
- `destructiveChanges()`;
- `approve()`;
- `execute(options)`;
- `toJSON()`.

### `MigrationStore`

Manages:

- migration directory;
- backup directory;
- encrypted migration files;
- encrypted backups;
- schema snapshot;
- retention cleanup;
- checksum validation.

### `MigrationRunner`

Responsible for:

- migration history table;
- operation execution;
- transaction handling through the dialect;
- checksum consistency;
- backup creation;
- persisted migration state.

### `SchemaDiffer`

Compares desired and current snapshots and produces migration operations.

### `SchemaInspector`

Reads the active database schema through dialect-specific information-schema queries.
