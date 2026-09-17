# SQL dialect reference

## Table of contents

1. [Supported dialects](#supported-dialects)
2. [Runtime query behavior](#runtime-query-behavior)
3. [Migration DDL](#migration-ddl)
4. [MySQL](#mysql)
5. [PostgreSQL](#postgresql)

## Supported dialects

The connector supports:

- `mysql`;
- `postgres`.

MySQL is the default runtime dialect.

## Runtime query behavior

| Behavior | MySQL | PostgreSQL |
|---|---|---|
| Identifier quote | `` `name` `` | `"name"` |
| Parameter | `?` | `$1`, `$2`, ... |
| Boolean literal | `1` / `0` | `TRUE` / `FALSE` |
| UUID generation | `UUID()` | `gen_random_uuid()` |

The query layer tracks placeholder indexes so conditions such as `IN`, `BETWEEN`, `LIMIT` and `OFFSET` remain valid for PostgreSQL.

## Migration DDL

The migration subsystem uses dedicated dialect classes because schema DDL requires different SQL on MySQL and PostgreSQL.

Migration-specific responsibilities include:

- type mapping;
- column definitions;
- table creation;
- adding, renaming, altering and dropping columns;
- table removal;
- schema introspection;
- migration-history storage;
- transactional DDL behavior.

## MySQL

The runtime uses `mysql2`.

The migration dialect creates the migration history table with `DATETIME` timestamps and uses InnoDB table options for generated tables.

## PostgreSQL

The runtime uses `pg`.

The migration dialect uses PostgreSQL identity syntax for auto-incrementing integer fields and `TIMESTAMPTZ` for migration-history timestamps.
