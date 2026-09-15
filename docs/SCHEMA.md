# Schema reference

## Table of contents

1. [Schema object](#schema-object)
2. [Field definition](#field-definition)
3. [Types](#types)
4. [Length, precision and scale](#length-precision-and-scale)
5. [Defaults](#defaults)
6. [Constraints](#constraints)
7. [Enums](#enums)
8. [Foreign keys](#foreign-keys)
9. [Column renames](#column-renames)
10. [Custom SQL](#custom-sql)

## Schema object

```js
const { Schema } = require('@mlagie/sql-connector');

const userSchema = new Schema({
  id: { type: Number, primary_key: true, auto_increment: true },
  email: { type: String, required: true, unique: true, length: 320 },
});
```

`Schema` stores the desired field definitions in `schemaDict`.

## Field definition

```js
{
  type: String,
  length: 255,
  precision: 12,
  scale: 2,
  required: true,
  default: 'active',
  unique: true,
  primary_key: false,
  auto_increment: false,
  enum: ['active', 'inactive'],
  foreignKey: 'users(id)',
  oldname: 'legacy_email',
  customize: 'CHECK (...)'
}
```

## Types

The built-in map is:

```text
String             -> VARCHAR
Char               -> CHAR
Number             -> INT
SmallInt           -> SMALLINT
BigInt             -> BIGINT
Decimal            -> DECIMAL
Boolean            -> BOOLEAN
Date               -> DATETIME
Object             -> JSON
Array              -> VARCHAR
Now                -> NOW()
Float              -> FLOAT
Double             -> DOUBLE
Text               -> TEXT
Blob               -> BLOB
Binary             -> VARBINARY
Uuid               -> CHAR
DateTime           -> DATETIME
Timestamp          -> TIMESTAMP
CurrentTimestamp   -> CURRENT_TIMESTAMP
```

JavaScript constructors `String`, `Number`, `Boolean`, `Date`, `Object` and `Array` are also accepted by the schema API.

## Length, precision and scale

Use `length` with `VARCHAR`, `CHAR`, `BINARY` and `VARBINARY`.

Use `precision` and `scale` with `DECIMAL`:

```js
amount: {
  type: 'DECIMAL',
  precision: 12,
  scale: 2,
}
```

## Defaults

Defaults may be `null`, strings, numbers, booleans, dates, objects, temporal SQL expressions or functions returning supported values.

```js
created_at: {
  type: Date,
  default: 'CURRENT_TIMESTAMP',
}
```

`sqlTypeMap.CurrentTimestamp` is available as a reusable constant.

## Constraints

Supported field-level constraints:

- `required` → `NOT NULL`;
- `unique` → `UNIQUE`;
- `primary_key` → `PRIMARY KEY`;
- `auto_increment` → auto-increment / identity behavior;
- `foreignKey` → `FOREIGN KEY`;
- `default` → `DEFAULT`;
- `enum` → `ENUM` where supported by the generated dialect SQL;
- `customize` → additional SQL definition.

Do not set `primary_key` and `unique` together.

## Enums

```js
status: {
  type: String,
  enum: ['pending', 'paid', 'cancelled'],
  default: 'pending',
}
```

Enum values are SQL-escaped when the column definition is generated.

## Foreign keys

The connector accepts both forms:

```js
user_id: { type: Number, foreignKey: 'users(id)' }
user_id: { type: Number, foreignKey: 'users.id' }
```

`Model.syncAllTables()` orders table creation according to model dependencies and rejects cycles.

## Column renames

Migrations use `oldname` for explicit renames:

```js
email_address: {
  type: String,
  oldname: 'email',
}
```

The differ never guesses a rename from similar names.

## Custom SQL

```js
amount: {
  type: 'DECIMAL',
  precision: 12,
  scale: 2,
  customize: 'CHECK (amount >= 0)',
}
```

`customize` is appended to the generated column definition. Treat it as trusted SQL.
