# Query and condition reference

## Table of contents

1. [Structured filters](#structured-filters)
2. [Values](#values)
3. [Comparison operators](#comparison-operators)
4. [IN and NOT IN](#in-and-not-in)
5. [BETWEEN and NOT BETWEEN](#between-and-not-between)
6. [NULL](#null)
7. [AND, OR and NOT](#and-or-and-not)
8. [Select](#select)
9. [Group by](#group-by)
10. [Having](#having)
11. [Order by](#order-by)
12. [Limit and offset](#limit-and-offset)
13. [Joins](#joins)

## Structured filters

`where` and `having` accept structured objects. Raw SQL strings are rejected by the query builder.

```js
{
  status: 'active',
  age: { '>=': 18 },
}
```

Fields at the same object level are combined with `AND`.

## Values

A scalar value means equality:

```js
{ status: 'active' }
```

Values are bound through driver parameters.

`null` is special and becomes `IS NULL`:

```js
{ deleted_at: null }
```

Objects that do not contain a recognized operator are treated as values and passed to the driver.

## Comparison operators

Supported operators:

```text
=
!=
>
<
>=
<=
LIKE
NOT LIKE
ILIKE
NOT ILIKE
IN
NOT IN
BETWEEN
NOT BETWEEN
```

Examples:

```js
{ age: { '>=': 18 } }
{ email: { LIKE: '%@example.com' } }
{ email: { 'NOT LIKE': '%@example.com' } }
```

## IN and NOT IN

```js
{ status: { IN: ['active', 'pending'] } }
{ status: { 'NOT IN': ['deleted', 'blocked'] } }
```

Each item receives its own parameter placeholder.

## BETWEEN and NOT BETWEEN

```js
{ age: { BETWEEN: [18, 65] } }
{ age: { 'NOT BETWEEN': [18, 65] } }
```

The value is a two-element array `[min, max]`.

## NULL

```js
{ deleted_at: null }
{ deleted_at: { '=': null } }
{ deleted_at: { '!=': null } }
```

These compile to `IS NULL` / `IS NOT NULL`.

## AND, OR and NOT

```js
{
  AND: [
    { active: true },
    {
      OR: [
        { role: 'admin' },
        { role: 'moderator' },
      ],
    },
  ],
}
```

Negation:

```js
{
  NOT: {
    status: { IN: ['deleted', 'blocked'] },
  },
}
```

Empty logical arrays and invalid `NOT` values are rejected.

## Select

Supported structured select entries include:

| Entry | Meaning |
|---|---|
| `'email'` | Column |
| `'*'` | All columns |
| `{ col: 'email', as: 'address' }` | Column + alias |
| `{ sum: 'amount', as: 'total' }` | `SUM` |
| `{ count: 'id', as: 'total' }` | `COUNT` |
| `{ count: ['team', 'source'] }` | Multi-column count expression |
| `{ count: { status: 'active' } }` | Conditional count |
| `{ distinct: 'status' }` | `DISTINCT` |
| `{ dateFormat: ['created_at', '%Y-%m'] }` | Date formatting |

Example:

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
    { sum: 'amount', as: 'revenue' },
  ],
  where: { active: true },
});
```

## Group by

`groupBy` is passed as an option to `find()`:

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
  ],
  groupBy: ['status'],
});
```

Structured group items can use `col` and `dateFormat` (and the builder accepts `as`).

## Having

`having` filters grouped results and uses the same structured condition format as `where`:

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
  ],
  groupBy: ['status'],
  having: {
    total: { '>': 10 },
  },
});
```

The condition is applied after `GROUP BY`. Raw `HAVING` strings are rejected.

## Order by

`orderBy` is also part of the `find()` options and can sort by a selected column or alias:

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
  ],
  groupBy: ['status'],
  having: {
    total: { '>': 10 },
  },
  orderBy: [
    { field: 'total', direction: 'DESC' },
    { field: 'status', direction: 'ASC' },
  ],
});
```

Only `ASC` and `DESC` are accepted.

## Complete example

The following example combines `SELECT`, aggregation, `WHERE`, `GROUP BY`, `HAVING` and `ORDER BY` in one query:

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
    { sum: 'amount', as: 'revenue' },
  ],
  where: {
    active: true,
  },
  groupBy: ['status'],
  having: {
    total: { '>': 10 },
  },
  orderBy: [
    { field: 'total', direction: 'DESC' },
  ],
});
```

Conceptually, this produces the following SQL shape:

```sql
SELECT status, COUNT(id) AS total, SUM(amount) AS revenue
FROM users
WHERE active = ?
GROUP BY status
HAVING total > ?
ORDER BY total DESC
```

`WHERE` and `HAVING` values remain parameterized by the Connector.

## Limit and offset

```js
{
  limit: 50,
  offset: 100,
}
```

Both values must be non-negative integers. PostgreSQL uses numbered placeholders for these values.

## Joins

`Model.find()` currently emits an `INNER JOIN` from `join.table` and `join.on`:

```js
join: {
  table: 'profiles',
  on: 'users.id = profiles.user_id',
}
```

The `on` expression is SQL text and must therefore be trusted.
