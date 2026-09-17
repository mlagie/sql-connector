# sql-connector documentation

This directory contains the detailed reference documentation for `@mlagie/sql-connector`.

## Contents

| Document | Purpose |
|---|---|
| [Schema](./SCHEMA.md) | Types, fields, defaults, constraints and foreign keys. |
| [Queries and conditions](./QUERY.md) | `WHERE`, `HAVING`, operators, values, aggregations, grouping, ordering and joins. |
| [Migrations](./MIGRATIONS.md) | Planning, schema diffing, approvals, destructive changes, checksums, encryption and backups. |
| [API](./API.md) | Public exports and method reference. |
| [Dialects](./DIALECTS.md) | MySQL/PostgreSQL behavior and SQL generation differences. |
| [French documentation](./fr/README_FR.md) | Documentation française. |

## Documentation principles

The documentation describes the behavior implemented by the current package rather than every SQL feature that exists in the SQL standard or in an individual database engine.

Where an API is intentionally narrower than raw SQL, the supported structured representation is documented explicitly.
