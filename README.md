# sql-connector documentation

![GitHub package.json version](https://img.shields.io/github/package-json/v/lagie-marin/sql-connector?color=#008000) ![NPM Downloads](https://img.shields.io/npm/d18m/%40mlagie%2Fsql-connector?color=#008000) ![NPM Downloads](https://img.shields.io/npm/dw/%40mlagie%2Fsql-connector?color=#008000) ![GitHub followers](https://img.shields.io/github/followers/lagie-marin?style=plastic&color=color%3D%23008000) ![GitHub repo size](https://img.shields.io/github/repo-size/lagie-marin/sql-connector?color=%green)
 ![GitHub last commit](https://img.shields.io/github/last-commit/lagie-marin/sql-connector)

[Français](./docs/fr/README.md) | English

sql-connector helps manage MySQL connections, define table schemas, sync tables automatically, and work with database models through a small API.

## Import

```javascript
const { Schema, connect, logout, Model, ModelInstance, client, sqlTypeMap } = require('sql-connector');
```

## Database connection

`connect(config)` opens a MySQL connection using a configuration object compatible with mysql2.

```javascript
const config = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydatabase'
};

await connect(config);
```

`logout()` closes the active connection.

```javascript
await logout();
```

### Example

```js
const { connect: dbConnect, client, Model } =  require("@mlagie/sql-connector");


await dbConnect({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'password',
    database: 'mydatabase',
    connectionLimit: 2,
    multipleStatements: true,
    idleTimeout: 10000,
    typeCast: true,
    }).then(() => { Logger.client("- connected to the database") }).catch(error => {
        console.error(error);
        process.exit();
});
```

## Schema

`Schema` describes the structure of a table. Each field can use the following properties.

| Property       | Type                             | Description            |
|----------------|----------------------------------|------------------------|
| type           | `SqlType` or `{ name: SqlType }` | SQL type for the field |
| length         | `number`                         | Maximum length         |
| required       | `boolean`                        | Not null constraint    |
| default        | `any`                            | Default value          |
| unique         | `boolean`                        | Unique constraint      |
| auto_increment | `boolean`                        | Auto increment         |
| foreignKey     | `string`                         | Foreign key reference  |
| enum           | `string[]`                       | Allowed values         |
| primary_key    | `boolean`                        | Primary key flag       |
| customize      | `string`                         | Extra SQL options      |

### Example Schema creation & Model Creation

```javascript
const { Schema, Model, sqlTypeMap } = require("@mlagie/sql-connector");

const userSchema = new Schema({
    id: {
        type: Number,
        auto_increment: true,
        primary_key: true
    },
    group_uuid: {
        type: String,
        required: true,
        primary_key: true,
        length: 36
    },
    email: {
        type: String,
        length: 255,
        unique: true,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'pending'],
        default: 'pending'
    },
    uuid: {
        type: String,
        required: true,
        primary_key: true,
        length: 36
    },
    my_uuid: {
        type: String,
        required: true,
        length: 36
    },
    created_at: {
        type: Date,
        default: sqlTypeMap.CurrentTimestamp
    }
});

module.exports = new Model("User", userSchema);
```

## Table synchronization

`Model.syncAllTables()` compares JS schemas with the database and applies only meaningful differences.

- New columns are added automatically.

```javascript
await Model.syncAllTables();
```

Important: do not set both `primary_key: true` and `unique: true` on the same field. A primary key is already unique and not null.

## Models

`Model` represents a SQL table.

Main methods:

- `save(data)` Inserts a row
- `find(options)` Retrieves entries from the table.
- `count(filter)` Counts rows
- `customRequest(custom)` Runs a custom SQL query
- `delete(filter)` Deletes a row
- `dropTable()` Drops the table
- `generate_uuid()` Generates a unique UUID

```javascript
const userModel = new Model('users', userSchema);

await Model.syncAllTables();
await userModel.save({ email: 'user@example.com', status: 'active' });

const user = await userModel.find({ where: { email: 'user@example.com' }});
await user[0].deleteOne();
```

## save function

Saves data to the database table.

- **Parameters** `data` *(Object)* - The data to insert into the table.
- **Returns** `Promise<Object>` - A promise that resolves with the result of the insertion.
- **Throws** `Error` - Throws an error if the insert fails.

```js
const User = require("user");

async function createUser(email, stat) {
    if (!email || !stat) {
        console.error("Email & stat is required");
        return;
    }
    await User.save({ email: email, status: stat });

}
```

## find function

Retrieves entries from the table.

- **Parameters** `options` *(Object)* - Query options.
- **Parameters** `options.select` *(Array<string|SelectAggregation>)* - Fields, aggregations, or transformations to be returned.
- **Parameters** `options.where` *(Object / string)* - Filtering conditions (key/value object or raw string condition).
- **Parameters** `options.groupBy` *(string[])* - Fields used to group results.
- **Parameters** `options.orderBy` *(Array<string|OrderByOption>)* - Sorting rules.
- **Parameters** `options.join` *(JoinOption / JoinOption[])* - Table join configuration structures.
- **Parameters** `options.limit` *(number)* - Maximum number of results to return.
- **Returns** `Promise<Array<ModelInstance>>`

### Advanced `select` Options (`SelectAggregation`)

Each element in the `select` array can be either a standard string (raw column name) or an object providing advanced SQL capabilities and aggregations:

| Property inside `select` object | Type              | Description                                                                                          |                                  Example / Generated SQL                                           |
|---------------------------------|-------------------|------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `col`                           | `string`          | Selects a plain, unaggregated table column.                                                          | `{ col: 'email' }` $\rightarrow$ \`email\`                                                         |
| `sum`                           | `string`          | Computes the sum of all numerical values in a column.                                                | `{ sum: 'error' }` $\rightarrow$ `SUM(` \`error\``)`                                               |
| `distinct`                      | `string`          | Applies a DISTINCT constraint on the specified column.                                               | `{ distinct: 'status' }` $\rightarrow$ `DISTINCT` \`status\`                                       |
| `dateFormat`                    | `[string, string]`| Formats a Date column using standard MySQL formatting (Format: `[column, mysql_format_string]`).     | `{ dateFormat: ['created_at', '%Y-%m'] }` $\rightarrow$ `DATE_FORMAT(` \`created_at\``, '%Y-%m')`  |
| `count`                         | `string`          | Standard row counting (ignores `NULL` values).                                                       | `{ count: 'id' }` $\rightarrow$ `COUNT(` \`id\``)`                                                 |
| `count` (Array)                 | `string[]`        | Counts unique combinations across multiple columns (COUNT DISTINCT).                                 | `{ count: ['team', 'source'] }` $\rightarrow$ `COUNT( DISTINCT` \`team\``,` \`source\``)`          |
| `count` (Object)                | `Object`          | Automated conditional aggregation (`CASE WHEN`). Perfect for KPIs and status metrics.                | `{ count: { deletedAt: null } }` $\rightarrow$ `COUNT(CASE WHEN` \`deletedAt\``= NULL THEN 1 END)` |
| `as`                            | `string`          | Sets a custom output identifier or aggregation alias (SQL `AS`).                                     | `{ count: 'id', as: 'total' }` $\rightarrow$ `COUNT(` \`id\``) AS` \`total\`                       |

---

### Complex Structured Options (`orderBy` & `join`)

#### OrderByOption

Enables explicit sorting across one or multiple columns:

- **field** `(string)`: The target column name to apply sorting on.
- **direction** `('ASC'\|'DESC')`: The sorting direction (Defaults to `'ASC'`).

#### JoinOption

Specifies one or multiple relational database table joins:

- **table** `(string)`: Target table name to join with.
- **on** `(string)`: Relational equation statement string (e.g., `"ProjectPipelines.project_id = Projects.id"`).
- **alias** `(string)` *(Optional)*: An alternative SQL alias name for the joined table.
- **type** `('INNER'\|'LEFT'\|'RIGHT')` *(Optional)*: SQL join modality (Defaults to `'INNER'`).

---

## Example find

```js
const User = require("user");

User.find({
  select: [
    { dateFormat: ['date_day', '%Y-%m'], as: 'period' },
    { sum: 'error' },
    { sum: 'reload' },
  ],
  groupBy: ['period'],
  orderBy: [{ field: 'period', direction: 'ASC' }],
  limit: 10
});
```

```js
const User = require("user");

User.find({
  select: [
    "email"
  ],
  where: {
    id: 1
  }
})
```

### Advanced Examples using `find`

#### 1. Standard, Distinct, and Multi-Column Counting

Count global rows alongside multi-column unique combinations, such as identifying unique team and source pipelines:

```js
const { MyTable } = require("./models");

const stats = await MyTable.find({
  select: [
    { count: 'id', as: 'total_pipelines' },
    { count: ['cteam', 'csource'], as: 'unique_groups' } // Multi-column COUNT DISTINCT
  ],
  where: { csource: 'web' }
});
```

#### 2. Conditional Aggregations (Active / Decommissioned KPI Metrics)

By passing an object to the `count` attribute, the ORM automatically structures a conditional `CASE WHEN` clause. This allows you to split different status counters into a single database trip:

```js
const { MyTable } = require("./models");

const ppiStats = await MyTable.find({
  select: [
    { count: { deletedAt: null }, as: 'active' },          // Counts where deletedAt = NULL
    { count: { status: 'SUCCESS' }, as: 'total_success' }   // Counts where status = 'SUCCESS'
  ],
  where: {
    source: 'jenkins',
    team: 'GROUP-1'
  }
});
```

#### 3. Table Joins, Time Series Grouping, and Multi-Column Sorting

An advanced query orchestration combining left table joining, date formatting conversions, and sorting:

```js
const { MyTable } = require("./models");

const history = await MyTable.find({
  select: [
    { col: 'Projects.name', as: 'project_name' },
    { dateFormat: ['ProjectPipelines.created_at', '%Y-%m'], as: 'period' },
    { count: 'ProjectPipelines.id', as: 'pipelines_count' }
  ],
  where: "ProjectPipelines.deletedAt IS NULL", // Raw condition strings are permitted
  join: {
    table: 'Projects',
    on: 'ProjectPipelines.project_id = Projects.id',
    type: 'LEFT'
  },
  groupBy: ['project_name', 'period'],
  orderBy: [
    { field: 'period', direction: 'DESC' },
    { field: 'project_name', direction: 'ASC' }
  ],
  limit: 50
});
```

## count function

Counts the number of records matching the given filter.

- **Parameters** `filter` *(Object)* The filter criteria for the query. Should be an object where keys are column names and values are the values to filter by.
- **Returns** `Promise<ModelInstance|number>` - A promise that resolves to a `ModelInstance` if a record is found, or `0` if no records match the filter.

## Example count

```js
const User = require("user");

User.count({
  id: id
})
```

## customRequest function

The customRequest function allows you to execute SQL queries that are not supported by sql-connector; this could be in queries where the keywords are not yet implemented.

- **Parameters** `custom` *(string)*  The custom SQL_request query to execute.
- **Returns** `Promise<void>` A promise that resolves when the query is executed.
- **Throws** `Error` Throws an error if query execution fails.

## Example customRequest

```js
const User = require("user");

User.customRequest("SELECT id, email, status
  FROM users
  WHERE status IN ('active', 'pending')
  AND email LIKE '%gmail.com';")
```

## delete function

Deletes an entry from the SQL table that matches the provided filter.

- **Parameters** `filter` *(Object)* An object representing the filter conditions for deletion.
- **Returns** `Promise<number>` A promise that resolves to 0 if no rows were deleted, * or to a ModelInstance representing the deleted row.
- **Throws** `Error` Throws an error if the SQL query fails.

## Example delete

```js
const User = require("user");

User.delete({
  email: my@gmail.com
})
```

## dropTable function

Asynchronously drops a table if it exists in the database.

This function constructs a SQL_request query to drop a table with the name specified by the `this.name` property. It then executes the query using a promise-based approach.
If the query is successful, the result is logged to the console.
If an error occurs during the execution of the query, an error message is logged.

- **Returns** `Promise<void>` A promise that resolves when the query execution is complete.

## Example dropTable

```js
const User = require("user");

User.dropTable();
```

## generate_uuid function

Generates a unique UUID for the current model.
This function generates a UUID using the SQL_request `UUID()` function and checks if the generated UUID already exists in the database for the current model. If the UUID is unique, it is returned.
Otherwise, the function resolves to `null`.

- **Parameters** `string` var_uuid By default, it is set to uuid.
- **Returns** `Promise<string|null>` A promise that resolves to a unique UUID string if successful, or `null` if an error occurs or the UUID is not unique.
- **Throws** `Error` If there is an error executing the SQL_request query.

## Example generate_uuid

```js
const User = require("user");

const uuid = await User.generate_uuid();
const my_uuid = await User.generate_uuid("my_uuid");

await User.save{ email: "user@example.com", status: "active", uuid: uuid, my_uuid: my_uuid }
```

## Model instances

`ModelInstance` represents a row already loaded from the database.

- `updateOne(model)` updates the row
- `delete(model)` deletes the row using a filter
- `deleteOne()` deletes the instance row
- `customRequest(custom)` runs a custom query

```js
const userInstance = await find({ select: "users", where: { email: 'user@example.com' }})[0];

await userInstance.updateOne({ status: 'inactive' });
await userInstance.deleteOne();
```

## SQL types

`sqlTypeMap` exposes the common SQL types.

```javascript
console.log(sqlTypeMap.String); // "VARCHAR"
```

## Client

`client` is a shared object meant to host reusable application functions.

```javascript
module.exports = client => {
  client.checkServer = () => {
    if (server.isLaunch()) {
      return 1;
    }

    return 0;
  };
};
```

## Summary

sql-connector provides a small layer to connect to MySQL, describe schemas, synchronize tables, and manipulate data with typed models.
