import { PoolOptions } from "mysql2";

/**
 * Supported SQL data types exposed by SQL Connector.
 *
 * SQL Connector uses a database-independent type vocabulary.
 * The selected SQL dialect is responsible for translating these
 * logical types into the native SQL type.
 *
 * @example
 * ```ts
 * const schema = new Schema({
 *   name: {
 *     type: "String",
 *     length: 255
 *   },
 *   age: {
 *     type: "Number"
 *   },
 *   active: {
 *     type: "Boolean"
 *   }
 * });
 * ```
 */
export type SqlType =
    | "String"
    | "Char"
    | "Number"
    | "SmallInt"
    | "BigInt"
    | "Decimal"
    | "Boolean"
    | "Date"
    | "Object"
    | "Array"
    | "Now"
    | "Float"
    | "Double"
    | "Text"
    | "Blob"
    | "Binary"
    | "Uuid"
    | "DateTime"
    | "Timestamp"
    | "CurrentTimestamp";

/**
 * Maps SQL Connector logical types to their TypeScript representation.
 *
 * Custom keys are supported for dialect-specific or user-defined types.
 *
 * @example
 * ```ts
 * const value: SqlTypeMap = {
 *   String: "varchar",
 *   Number: "integer",
 *   Date: "date"
 * };
 * ```
 */
export interface SqlTypeMap {
    String: string;
    Number: string;
    Date: string;
    CurrentTimestamp: string;

    /**
     * Allows additional SQL type mappings.
     */
    [key: string]: any;
}

/**
 * SQL type mapping used internally by the connector.
 */
export const sqlTypeMap: SqlTypeMap;

/**
 * Native JavaScript constructors accepted as schema types.
 *
 * SQL Connector normalizes these constructors to its logical SQL types.
 *
 * @example
 * ```ts
 * const schema = new Schema({
 *   username: { type: String },
 *   age: { type: Number },
 *   active: { type: Boolean },
 *   createdAt: { type: Date }
 * });
 * ```
 */
export type SqlTypeConstructor =
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | DateConstructor
    | ObjectConstructor
    | ArrayConstructor;

/**
 * Input accepted for a schema field type.
 *
 * A type can be specified using:
 * - a SQL Connector type name;
 * - a `{ name: ... }` descriptor;
 * - a native JavaScript constructor.
 *
 * @example
 * ```ts
 * type: "String"
 * ```
 *
 * @example
 * ```ts
 * type: String
 * ```
 *
 * @example
 * ```ts
 * type: { name: "String" }
 * ```
 */
export type SchemaTypeInput =
    | SqlType
    | { name: SqlType }
    | SqlTypeConstructor;

/**
 * Describes a column in a SQL Connector schema.
 *
 * Schema fields can define SQL types, constraints, defaults,
 * indexes, foreign keys and migration metadata.
 *
 * @example
 * ```ts
 * const userSchema = new Schema({
 *   id: {
 *     type: "Uuid",
 *     primary_key: true
 *   },
 *
 *   email: {
 *     type: "String",
 *     length: 320,
 *     required: true,
 *     unique: true
 *   },
 *
 *   age: {
 *     type: "Number"
 *   }
 * });
 * ```
 */
export interface SchemaField {
    /**
     * SQL Connector type used by the column.
     */
    type: SchemaTypeInput;

    /**
     * Maximum length of a character or binary field.
     *
     * @example
     * ```ts
     * { type: "String", length: 255 }
     * ```
     */
    length?: number;

    /**
     * Total number of digits for numeric types such as DECIMAL.
     *
     * @example
     * ```ts
     * { type: "Decimal", precision: 12, scale: 2 }
     * ```
     */
    precision?: number;

    /**
     * Number of digits stored after the decimal point.
     *
     * @example
     * ```ts
     * { type: "Decimal", precision: 12, scale: 2 }
     * ```
     */
    scale?: number;

    /**
     * Marks the column as NOT NULL.
     *
     * @example
     * ```ts
     * { type: "String", required: true }
     * ```
     */
    required?: boolean;

    /**
     * Default value assigned by the database.
     *
     * `CurrentTimestamp` can be used for database-generated timestamps.
     *
     * @example
     * ```ts
     * {
     *   type: "Timestamp",
     *   default: "CurrentTimestamp"
     * }
     * ```
     */
    default?: any | SqlType | "CurrentTimestamp";

    /**
     * Adds a UNIQUE constraint.
     */
    unique?: boolean;

    /**
     * Marks the column as auto-incrementing.
     */
    auto_increment?: boolean;

    /**
     * Legacy foreign-key declaration.
     *
     * Prefer the structured `references` declaration when available.
     *
     * @example
     * ```ts
     * {
     *   type: "Number",
     *   foreignKey: "users(id)"
     * }
     * ```
     */
    foreignKey?: string;

    /**
     * Allowed values for an enum-like column.
     *
     * @example
     * ```ts
     * {
     *   type: "String",
     *   enum: ["pending", "paid", "cancelled"]
     * }
     * ```
     */
    enum?: string[];

    /**
     * Marks the column as the primary key.
     */
    primary_key?: boolean;

    /**
     * Previous column name used by migrations when a column is renamed.
     *
     * @example
     * ```ts
     * {
     *   type: "String",
     *   oldname: "username"
     * }
     * ```
     */
    oldname?: string;

    /**
     * Allows custom SQL to be attached to the column definition.
     */
    customize?: string;
}

/**
 * Collection of schema fields indexed by column name.
 *
 * @example
 * ```ts
 * const schema: SchemaDict = {
 *   id: {
 *     type: "Uuid",
 *     primary_key: true
 *   },
 *   email: {
 *     type: "String",
 *     unique: true
 *   }
 * };
 * ```
 */
export interface SchemaDict {
    [key: string]: SchemaField;
}

/**
 * Describes an aggregate or calculated expression used in SELECT.
 *
 * Supported expressions include COUNT and SUM as well as column
 * expressions and date formatting.
 *
 * @example
 * ```ts
 * const users = await model.find({
 *   select: [
 *     "status",
 *     { count: "id", as: "total" }
 *   ]
 * });
 * ```
 *
 * @example
 * ```ts
 * const revenue = await model.find({
 *   select: [
 *     { sum: "amount", as: "revenue" }
 *   ]
 * });
 * ```
 */
export type SelectAggregation = {
    /**
     * Column used by the expression.
     */
    col?: string;

    /**
     * Calculates SUM(column).
     */
    sum?: string;

    /**
     * Selects a DISTINCT value/expression.
     */
    distinct?: string;

    /**
     * Formats a date expression.
     *
     * @example
     * ```ts
     * { dateFormat: ["created_at", "%Y-%m"], as: "month" }
     * ```
     */
    dateFormat?: [string, string];

    /**
     * Calculates COUNT(column).
     *
     * A string, list of strings or object may be supplied
     * depending on the query builder expression.
     *
     * @example
     * ```ts
     * { count: "id", as: "total" }
     * ```
     */
    count?: string | string[] | Record<string, any>;

    /**
     * Alias assigned to the resulting expression.
     */
    as?: string;
};

/**
 * Value accepted in the SELECT list.
 *
 * A SELECT item can either be a column name or an aggregate expression.
 *
 * @example
 * ```ts
 * select: [
 *   "status",
 *   { count: "id", as: "total" }
 * ]
 * ```
 */
export type SelectItem = string | SelectAggregation;

/**
 * Describes an expression used by GROUP BY.
 *
 * @example
 * ```ts
 * groupBy: [
 *   "status"
 * ]
 * ```
 *
 * @example
 * ```ts
 * groupBy: [
 *   {
 *     col: "created_at",
 *     dateFormat: ["created_at", "%Y-%m"],
 *     as: "month"
 *   }
 * ]
 * ```
 */
export interface GroupAggregation {
    /**
     * Column used for grouping.
     */
    col?: string;

    /**
     * Date formatting expression used before grouping.
     */
    dateFormat?: [string, string];

    /**
     * Alias assigned to the grouped expression.
     */
    as?: string;
}

/**
 * Defines a sort rule used by ORDER BY.
 *
 * @example
 * ```ts
 * orderBy: [
 *   {
 *     field: "created_at",
 *     direction: "DESC"
 *   }
 * ]
 * ```
 */
export interface OrderByOption {
    /**
     * Column or selected alias used for sorting.
     */
    field: string;

    /**
     * Sort direction.
     *
     * Defaults to ASC when omitted.
     */
    direction?: "ASC" | "DESC";
}

/**
 * SQL operators supported by the SQL Connector condition builder.
 *
 * These operators are converted to parameterized SQL expressions.
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   age: {
 *     ">=": 18
 *   }
 * };
 * ```
 */
export type WhereOperator =
    | "="
    | "!="
    | ">"
    | "<"
    | ">="
    | "<="
    | "LIKE"
    | "NOT LIKE"
    | "ILIKE"
    | "NOT ILIKE"
    | "IN"
    | "NOT IN"
    | "BETWEEN"
    | "NOT BETWEEN";

/**
 * Object containing a SQL comparison operator.
 *
 * @example
 * ```ts
 * {
 *   age: {
 *     ">=": 18
 *   }
 * }
 * ```
 *
 * @example
 * ```ts
 * {
 *   status: {
 *     IN: ["active", "pending"]
 *   }
 * }
 * ```
 */
export type WhereOperatorObject = {
    [K in WhereOperator]?: any;
};

/**
 * Represents a SQL WHERE or HAVING condition.
 *
 * Conditions can be combined recursively using AND, OR and NOT.
 *
 * A direct value represents an equality comparison.
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   status: "active"
 * };
 * ```
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   age: {
 *     ">=": 18,
 *     "<": 65
 *   }
 * };
 * ```
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   status: {
 *     IN: ["active", "pending"]
 *   }
 * };
 * ```
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   age: {
 *     BETWEEN: [18, 65]
 *   }
 * };
 * ```
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   AND: [
 *     { active: true },
 *     {
 *       age: {
 *         ">=": 18
 *       }
 *     }
 *   ]
 * };
 * ```
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   OR: [
 *     { status: "active" },
 *     { status: "pending" }
 *   ]
 * };
 * ```
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   NOT: {
 *     status: "cancelled"
 *   }
 * };
 * ```
 *
 * `null` is translated to SQL NULL semantics.
 *
 * @example
 * ```ts
 * const where: WhereClause = {
 *   deleted_at: null
 * };
 * ```
 */
export interface WhereClause {
    /**
     * Combines several conditions with AND.
     */
    AND?: WhereClause[];

    /**
     * Combines several conditions with OR.
     */
    OR?: WhereClause[];

    /**
     * Negates a condition.
     */
    NOT?: WhereClause;

    /**
     * Column conditions.
     */
    [key: string]:
    | any
    | WhereClause[]
    | WhereOperatorObject
    | undefined;
}

/**
 * Describes a SQL JOIN.
 *
 * @example
 * ```ts
 * const users = await model.find({
 *   join: {
 *     table: "companies",
 *     alias: "company",
 *     type: "LEFT",
 *     on: "users.company_id = company.id"
 *   }
 * });
 * ```
 */
export interface JoinOption {
    /**
     * Name of the table to join.
     */
    table: string;

    /**
     * SQL join condition.
     *
     * @example
     * ```ts
     * on: "users.company_id = company.id"
     * ```
     */
    on: string;

    /**
     * Optional table alias.
     */
    alias?: string;

    /**
     * Type of SQL JOIN.
     */
    type?: "INNER" | "LEFT" | "RIGHT";
}

type NormalizeSqlType<T> =
    T extends StringConstructor
    ? "String"
    : T extends NumberConstructor
    ? "Number"
    : T extends BooleanConstructor
    ? "Boolean"
    : T extends DateConstructor
    ? "Date"
    : T extends ObjectConstructor
    ? "Object"
    : T extends ArrayConstructor
    ? "Array"
    : T extends SqlType
    ? T
    : T extends { name: SqlType }
    ? T["name"]
    : never;

type InferSqlType<T> =
    NormalizeSqlType<T> extends "String" | "Text"
    ? string
    : NormalizeSqlType<T> extends "Number" | "Float"
    ? number
    : NormalizeSqlType<T> extends "Boolean"
    ? boolean
    : NormalizeSqlType<T> extends "Date" | "DateTime" | "Timestamp" | "Now"
    ? Date
    : NormalizeSqlType<T> extends "Object"
    ? Record<string, unknown>
    : NormalizeSqlType<T> extends "Array"
    ? unknown[]
    : unknown;

type HasKey<T, K extends PropertyKey> =
    K extends keyof T ? true : false;

type InferFieldValue<TField> =
    InferSqlType<TField extends { type: infer T } ? T : TField>;

type InferFieldNullable<TField> =
    TField extends { required: true }
    ? false
    : TField extends { primary_key: true }
    ? false
    : TField extends { auto_increment: true }
    ? false
    : TField extends { default: null }
    ? true
    : HasKey<TField, "default"> extends true
    ? false
    : true;

/**
 * Infers the TypeScript representation of a SQL Connector schema.
 *
 * Nullable fields are automatically represented using `null`.
 *
 * @example
 * ```ts
 * const schema = {
 *   id: {
 *     type: "Number",
 *     primary_key: true
 *   },
 *   name: {
 *     type: "String",
 *     required: true
 *   },
 *   nickname: {
 *     type: "String"
 *   }
 * } as const;
 *
 * type User = InferSchema<typeof schema>;
 *
 * // {
 * //   id: number;
 * //   name: string;
 * //   nickname: string | null;
 * // }
 * ```
 */
export type InferSchema<TSchema extends SchemaDict> = {
    [K in keyof TSchema]:
    InferFieldNullable<TSchema[K]> extends true
    ? InferFieldValue<TSchema[K]> | null
    : InferFieldValue<TSchema[K]>;
};

/**
 * Represents either a Schema instance or a schema-compatible object.
 *
 * @example
 * ```ts
 * const schema = new Schema({
 *   id: {
 *     type: "Number",
 *     primary_key: true
 *   }
 * });
 * ```
 */
export type SchemaLike<TSchema extends SchemaDict = SchemaDict> =
    | Schema<TSchema>
    | {
        schemaDict: TSchema;
        schema?: TSchema;
    };

/**
 * Represents a database record together with ModelInstance methods.
 */
export type ModelRecord<
    TData extends Record<string, any> = Record<string, any>
> = ModelInstance<TData> & TData;

/**
 * Represents a database schema definition.
 *
 * A Schema is used by Model to describe table columns,
 * constraints and migration metadata.
 *
 * @example
 * ```ts
 * const userSchema = new Schema({
 *   id: {
 *     type: "Uuid",
 *     primary_key: true
 *   },
 *   email: {
 *     type: "String",
 *     length: 320,
 *     required: true,
 *     unique: true
 *   }
 * });
 * ```
 */
export class Schema<TSchema extends SchemaDict = SchemaDict> {
    /**
     * Creates a schema definition.
     *
     * @param schemaDict Object describing the table columns.
     */
    constructor(schemaDict: TSchema);

    /**
     * Original schema definition.
     */
    schemaDict: TSchema;

    /**
     * Normalized schema definition.
     */
    schema: TSchema;
}

/**
 * Establishes a database connection.
 *
 * @param config MySQL/PostgreSQL connection pool configuration.
 * @returns A promise resolved once the connection has been established.
 *
 * @example
 * ```ts
 * await connect({
 *   host: "localhost",
 *   port: 3306,
 *   user: "root",
 *   password: "password",
 *   database: "application"
 * });
 * ```
 */
export function connect(config: PoolOptions): Promise<void>;

/**
 * Establishes a database connection using a specific SQL dialect.
 *
 * @param config Database connection pool configuration.
 * @param dialect SQL dialect to use.
 *
 * @example
 * ```ts
 * await connect(
 *   {
 *     host: "localhost",
 *     port: 5432,
 *     user: "postgres",
 *     password: "password",
 *     database: "application"
 *   },
 *   "postgres"
 * );
 * ```
 */
export function connect(
    config: PoolOptions,
    dialect?: string
): Promise<void>;

/**
 * Closes the active database connection.
 *
 * @returns A promise resolved after the connection has been closed.
 *
 * @example
 * ```ts
 * await logout();
 * ```
 */
export function logout(): Promise<void>;

/**
 * Represents a database model and provides CRUD/query operations.
 *
 * A Model connects a logical model name to a Schema definition.
 *
 * @example
 * ```ts
 * const User = new Model(
 *   "users",
 *   new Schema({
 *     id: {
 *       type: "Uuid",
 *       primary_key: true
 *     },
 *     email: {
 *       type: "String",
 *       required: true
 *     }
 *   })
 * );
 * ```
 */
export class Model<TSchema extends SchemaDict = SchemaDict> {
    /**
     * SQL type mapping used by the model.
     */
    static sqlTypeMap: Record<SqlType, string>;

    /**
     * Models waiting to be synchronized.
     */
    static pendingModels: Model[];

    /**
     * Database table/model name.
     */
    name: string;

    /**
     * Schema associated with the model.
     */
    schema: SchemaLike<TSchema>;

    /**
     * Creates a model.
     *
     * @param name Database table name.
     * @param schema Schema describing the table.
     */
    constructor(
        name: string,
        schema: SchemaLike<TSchema>
    );

    /**
     * Creates all registered model tables in dependency order.
     *
     * Foreign-key dependencies are taken into account before creating tables.
     *
     * @example
     * ```ts
     * await Model.syncAllTables();
     * ```
     */
    static syncAllTables(): Promise<void>;

    /**
     * Inserts a new record into the model table.
     *
     * @param data Data to insert.
     * @returns The inserted record/result.
     *
     * @example
     * ```ts
     * await userModel.save({
     *   email: "john@example.com",
     *   active: true
     * });
     * ```
     */
    save(
        data: Partial<InferSchema<TSchema>>
    ): Promise<any>;

    /**
     * Retrieves records from the model table.
     *
     * Supports filtering, selecting, aggregation, grouping, HAVING,
     * ordering, JOINs, pagination and offsets.
     *
     * Query execution uses parameterized values for conditions.
     *
     * @param options Query options.
     *
     * @example Basic SELECT
     * ```ts
     * const users = await userModel.find({
     *   select: ["id", "email", "active"]
     * });
     * ```
     *
     * @example WHERE
     * ```ts
     * const users = await userModel.find({
     *   where: {
     *     active: true,
     *     age: {
     *       ">=": 18
     *     }
     *   }
     * });
     * ```
     *
     * @example IN / NOT IN
     * ```ts
     * const users = await userModel.find({
     *   where: {
     *     status: {
     *       IN: ["active", "pending"]
     *     }
     *   }
     * });
     * ```
     *
     * @example BETWEEN
     * ```ts
     * const users = await userModel.find({
     *   where: {
     *     age: {
     *       BETWEEN: [18, 65]
     *     }
     *   }
     * });
     * ```
     *
     * @example AND / OR / NOT
     * ```ts
     * const users = await userModel.find({
     *   where: {
     *     OR: [
     *       { status: "active" },
     *       {
     *         AND: [
     *           { status: "pending" },
     *           { age: { ">=": 18 } }
     *         ]
     *       }
     *     ]
     *   }
     * });
     * ```
     *
     * @example Aggregation
     * ```ts
     * const stats = await userModel.find({
     *   select: [
     *     "status",
     *     { count: "id", as: "total" }
     *   ]
     * });
     * ```
     *
     * @example GROUP BY + HAVING + ORDER BY
     * ```ts
     * const stats = await userModel.find({
     *   select: [
     *     "status",
     *     { count: "id", as: "total" },
     *     { sum: "amount", as: "revenue" }
     *   ],
     *   where: {
     *     active: true
     *   },
     *   groupBy: ["status"],
     *   having: {
     *     total: {
     *       ">": 10
     *     }
     *   },
     *   orderBy: [
     *     {
     *       field: "total",
     *       direction: "DESC"
     *     }
     *   ]
     * });
     * ```
     *
     * @example JOIN
     * ```ts
     * const users = await userModel.find({
     *   select: [
     *     "users.id",
     *     "company.name"
     *   ],
     *   join: {
     *     table: "companies",
     *     alias: "company",
     *     type: "LEFT",
     *     on: "users.company_id = company.id"
     *   }
     * });
     * ```
     *
     * @example Pagination
     * ```ts
     * const users = await userModel.find({
     *   limit: 20,
     *   offset: 40
     * });
     * ```
     */
    find(options?: {
        /**
         * Columns and aggregate expressions returned by SELECT.
         *
         * @example
         * ```ts
         * select: [
         *   "status",
         *   { count: "id", as: "total" }
         * ]
         * ```
         */
        select?: SelectItem[];

        /**
         * Filters applied before grouping.
         *
         * @example
         * ```ts
         * where: {
         *   active: true,
         *   age: { ">=": 18 }
         * }
         * ```
         */
        where?: WhereClause;

        /**
         * GROUP BY expressions.
         *
         * @example
         * ```ts
         * groupBy: ["status"]
         * ```
         */
        groupBy?: Array<string | GroupAggregation>;

        /**
         * Filters applied after GROUP BY and aggregation.
         *
         * @example
         * ```ts
         * having: {
         *   total: { ">": 10 }
         * }
         * ```
         */
        having?: WhereClause;

        /**
         * ORDER BY rules.
         *
         * @example
         * ```ts
         * orderBy: [
         *   { field: "total", direction: "DESC" }
         * ]
         * ```
         */
        orderBy?: Array<string | OrderByOption>;

        /**
         * JOIN definitions.
         *
         * @example
         * ```ts
         * join: {
         *   table: "companies",
         *   alias: "company",
         *   type: "LEFT",
         *   on: "users.company_id = company.id"
         * }
         * ```
         */
        join?: JoinOption | JoinOption[];

        /**
         * Maximum number of records returned.
         *
         * @example
         * ```ts
         * limit: 20
         * ```
         */
        limit?: number;

        /**
         * Number of records skipped before returning results.
         *
         * @example
         * ```ts
         * offset: 40
         * ```
         */
        offset?: number;
    }): Promise<Array<ModelRecord<InferSchema<TSchema>>>>;

    /**
     * Counts records matching the supplied filter.
     *
     * @param filter Optional equality/filter object.
     * @returns Number of matching records.
     *
     * @example
     * ```ts
     * const count = await userModel.count({
     *   active: true
     * });
     * ```
     */
    count(
        filter?: Record<string, any> | Partial<InferSchema<TSchema>>
    ): Promise<number>;

    /**
     * Executes a custom SQL query.
     *
     * Use this method when a query cannot be represented by
     * the query builder.
     *
     * @param custom SQL query to execute.
     * @returns Query result.
     *
     * @example
     * ```ts
     * const users = await userModel.customRequest(
     *   "SELECT * FROM users"
     * );
     * ```
     */
    customRequest<TResult extends Record<string, any> = InferSchema<TSchema>>(
        custom: string
    ): Promise<ModelRecord<TResult> | 0>;

    /**
     * Deletes records matching the supplied filter.
     *
     * @param filter Conditions identifying the records to delete.
     * @returns Number of deleted records.
     *
     * @example
     * ```ts
     * await userModel.delete({
     *   status: "inactive"
     * });
     * ```
     */
    delete(
        filter: Record<string, any> | Partial<InferSchema<TSchema>>
    ): Promise<number>;

    /**
     * Drops the database table represented by this model.
     *
     * @example
     * ```ts
     * await userModel.dropTable();
     * ```
     */
    dropTable(): Promise<void>;

    /**
     * Generates a unique UUID for the model.
     *
     * @param var_uuid Optional UUID value to validate.
     * @returns A unique UUID or null if generation fails.
     *
     * @example
     * ```ts
     * const id = await userModel.generate_uuid();
     *
     * if (id) {
     *   console.log(id);
     * }
     * ```
     */
    generate_uuid(var_uuid?: string): Promise<string | null>;
}

/**
 * Defines a SQL JOIN operation.
 *
 * @example
 * ```ts
 * const join: JoinOption = {
 *   table: "companies",
 *   alias: "company",
 *   type: "LEFT",
 *   on: "users.company_id = company.id"
 * };
 * ```
 */
export interface JoinOption {
    table: string;
    on: string;
    alias?: string;
    type?: "INNER" | "LEFT" | "RIGHT";
}

/**
 * Configuration used by the migration system.
 *
 * Migration options control schema inspection, diff generation,
 * migration storage, backups, encryption and destructive changes.
 *
 * @example
 * ```ts
 * const options: MigrationOptions = {
 *   dialect: "mysql",
 *   models: [UserModel],
 *   directory: "./migrations",
 *   backupDirectory: "./backups",
 *   allowDestructiveChanges: false
 * };
 * ```
 */
export interface MigrationOptions {
    /**
     * Database connection used by the migration system.
     */
    connection?: any;

    /**
     * SQL dialect.
     *
     * Supported built-in dialects include `mysql` and `postgres`.
     */
    dialect?: string | any;

    /**
     * Models whose schemas should be compared against the database.
     */
    models?: Array<Model<any>>;

    /**
     * Directory containing generated migration files.
     *
     * Defaults to the configured migration directory.
     */
    directory?: string;

    /**
     * Directory used to store database/schema backups.
     */
    backupDirectory?: string;

    /**
     * Encryption key used to protect migration files.
     */
    encryptionKey?: string;

    /**
     * Retention policy for migration backups.
     *
     * Can be expressed in milliseconds or using duration strings.
     *
     * @example
     * ```ts
     * retention: "7d"
     * ```
     */
    retention?: number | string | null | false;

    /**
     * Allows operations that can modify or remove existing data/schema.
     *
     * Keep disabled unless destructive changes are explicitly intended.
     */
    allowDestructiveChanges?: boolean;

    /**
     * Allows table deletion during schema synchronization.
     *
     * This should normally remain disabled.
     */
    allowDropTables?: boolean;
}

/**
 * Serializable representation of a migration plan.
 *
 * This structure can be used for logs, inspection and migration tooling.
 */
export interface MigrationPlanJSON {
    /**
     * Migration identifier.
     */
    id: string;

    /**
     * SQL dialect used by the migration.
     */
    dialect: string;

    /**
     * SHA-256 checksum identifying the migration content.
     */
    checksum: string;

    /**
     * Schema operations contained in the plan.
     */
    operations: any[];

    /**
     * Generated SQL.
     */
    sql: string;

    /**
     * Indicates whether the schema differs from the desired state.
     */
    hasChanges: boolean;

    /**
     * Indicates whether destructive operations are present.
     */
    destructive: boolean;
}

/**
 * Represents a generated schema migration plan.
 *
 * A MigrationPlan is created by comparing the desired model schema
 * with the current database schema.
 *
 * @example
 * ```ts
 * const plan = await Migration.plan({
 *   models: [UserModel],
 *   dialect: "mysql"
 * });
 *
 * if (plan.hasChanges()) {
 *   console.log(plan.sql);
 * }
 * ```
 *
 * @example Approving destructive changes
 * ```ts
 * const plan = await Migration.plan({
 *   models: [UserModel]
 * });
 *
 * if (plan.hasDestructiveChanges()) {
 *   plan.approve();
 * }
 *
 * await plan.execute({
 *   allowDestructiveChanges: true
 * });
 * ```
 */
export class MigrationPlan {
    /**
     * Unique migration identifier.
     */
    id: string;

    /**
     * Schema operations generated by the differ.
     */
    operations: any[];

    /**
     * SQL generated for this migration.
     */
    sql: string;

    /**
     * Current desired schema snapshot.
     */
    snapshot: any;

    /**
     * Previous database schema snapshot.
     */
    previousSnapshot: any;

    /**
     * SQL dialect used by this plan.
     */
    dialect: string;

    /**
     * SHA-256 checksum of the migration.
     */
    checksum: string;

    /**
     * Indicates whether the migration has been explicitly approved.
     */
    approved: boolean;

    /**
     * Indicates whether the plan contains schema changes.
     *
     * @example
     * ```ts
     * if (plan.hasChanges()) {
     *   console.log(plan.sql);
     * }
     * ```
     */
    hasChanges(): boolean;

    /**
     * Indicates whether the migration contains destructive operations.
     *
     * @example
     * ```ts
     * if (plan.hasDestructiveChanges()) {
     *   console.warn("Manual approval required");
     * }
     * ```
     */
    hasDestructiveChanges(): boolean;

    /**
     * Returns the destructive operations contained in the plan.
     *
     * @example
     * ```ts
     * console.table(plan.destructiveChanges());
     * ```
     */
    destructiveChanges(): any[];

    /**
     * Explicitly approves the migration plan.
     *
     * @returns The current migration plan.
     *
     * @example
     * ```ts
     * plan.approve();
     * ```
     */
    approve(): this;

    /**
     * Executes the migration plan.
     *
     * Destructive migrations can require explicit approval.
     *
     * @param options Execution options.
     *
     * @example
     * ```ts
     * await plan.execute();
     * ```
     *
     * @example
     * ```ts
     * plan.approve();
     *
     * await plan.execute({
     *   requireApproval: true,
     *   allowDestructiveChanges: true
     * });
     * ```
     */
    execute(options?: {
        requireApproval?: boolean;
        allowDestructiveChanges?: boolean;
    }): Promise<any>;

    /**
     * Converts the migration plan to a serializable JSON object.
     *
     * @example
     * ```ts
     * const json = plan.toJSON();
     * console.log(json.checksum);
     * ```
     */
    toJSON(): MigrationPlanJSON;
}

/**
 * Stores migrations, snapshots and backups on disk.
 *
 * MigrationStore is responsible for migration persistence,
 * checksum validation and cleanup according to the retention policy.
 *
 * @example
 * ```ts
 * const store = new MigrationStore({
 *   directory: "./migrations",
 *   backupDirectory: "./backups",
 *   retention: "7d"
 * });
 * ```
 */
export class MigrationStore {
    /**
     * Directory containing migration files.
     */
    directory: string;

    /**
     * Directory containing backups.
     */
    backupDirectory: string;

    /**
     * Optional encryption key.
     */
    encryptionKey?: string;

    /**
     * Normalized retention duration in milliseconds.
     */
    retention: number | null;

    /**
     * Creates a migration store.
     *
     * @param options Storage configuration.
     */
    constructor(options?: {
        directory?: string;
        backupDirectory?: string;
        encryptionKey?: string;
        retention?: number | string | null | false;
    });

    /**
     * Creates the migration and backup directories if required.
     */
    ensureDirectories(): Promise<void>;

    /**
     * Writes a migration plan to persistent storage.
     *
     * @param plan Migration plan to persist.
     * @returns Path of the created migration file.
     */
    writeMigration(plan: MigrationPlan): Promise<string>;

    /**
     * Writes a backup to disk.
     *
     * @param name Backup file name.
     * @param content Backup content.
     * @returns Backup path, or null when no backup is created.
     */
    writeBackup(
        name: string,
        content: any
    ): Promise<string | null>;

    /**
     * Removes migration/backup files that exceed the configured retention period.
     *
     * @returns Number of removed files.
     *
     * @example
     * ```ts
     * const removed = await store.cleanup();
     * console.log(`Removed ${removed} old files`);
     * ```
     */
    cleanup(): Promise<number>;

    /**
     * Writes the current schema snapshot.
     *
     * @param snapshot Schema snapshot.
     * @returns Path of the snapshot file.
     */
    writeSnapshot(snapshot: any): Promise<string>;

    /**
     * Reads the latest stored schema snapshot.
     *
     * @returns Snapshot or null when none exists.
     */
    readSnapshot(): Promise<any | null>;

    /**
     * Lists persisted migration files.
     *
     * @returns Migration file paths.
     */
    listMigrationFiles(): Promise<string[]>;

    /**
     * Validates a migration checksum.
     *
     * @throws MigrationChecksumError when the checksum does not match.
     *
     * @example
     * ```ts
     * store.validateChecksum(actual, expected);
     * ```
     */
    validateChecksum(
        actual: string,
        expected: string
    ): void;
}

/**
 * Executes migration plans against a database.
 *
 * MigrationRunner manages migration history, execution and
 * SQL generation for individual schema operations.
 *
 * @example
 * ```ts
 * const runner = new MigrationRunner({
 *   connection,
 *   dialect,
 *   store,
 *   backupManager
 * });
 *
 * await runner.execute(plan);
 * ```
 */
export class MigrationRunner {
    /**
     * Creates a migration runner.
     *
     * @param options Runner dependencies.
     */
    constructor(options: {
        connection: any;
        dialect: any;
        store: MigrationStore;
        backupManager: any;
    });

    /**
     * Creates the migration history table if necessary.
     */
    ensureMigrationTable(): Promise<void>;

    /**
     * Returns migrations already applied to the database.
     */
    applied(): Promise<any[]>;

    /**
     * Executes a migration plan and records it as applied.
     *
     * @param plan Migration plan.
     * @param options Execution and safety options.
     *
     * @example
     * ```ts
     * await runner.execute(plan, {
     *   requireApproval: true
     * });
     * ```
     */
    execute(
        plan: MigrationPlan,
        options?: {
            requireApproval?: boolean;
            allowDestructiveChanges?: boolean;
        }
    ): Promise<any>;

    /**
     * Generates SQL for a single schema operation.
     *
     * @param operation Schema operation.
     * @returns SQL statement.
     */
    sqlForOperation(operation: any): string;
}

/**
 * Compares the desired schema with the current schema.
 *
 * SchemaDiffer generates a list of operations required to transform
 * the current database structure into the desired model structure.
 *
 * @example
 * ```ts
 * const differ = new SchemaDiffer({
 *   allowDestructiveChanges: false
 * });
 *
 * const operations = differ.diff(
 *   desiredSchema,
 *   currentSchema
 * );
 * ```
 */
export class SchemaDiffer {
    /**
     * Creates a schema differ.
     *
     * @param options Controls destructive schema changes.
     */
    constructor(options?: {
        allowDestructiveChanges?: boolean;
        allowDropTables?: boolean;
    });

    /**
     * Calculates schema differences.
     *
     * @param desired Desired schema.
     * @param current Current database schema.
     * @returns Schema operations required to synchronize the database.
     */
    diff(
        desired: any,
        current: any
    ): any[];
}

/**
 * Inspects the current database schema.
 *
 * The inspector reads tables, columns, constraints and other
 * database metadata using the selected SQL dialect.
 *
 * @example
 * ```ts
 * const inspector = new SchemaInspector(
 *   connection,
 *   dialect
 * );
 *
 * const snapshot = await inspector.inspect();
 * ```
 */
export class SchemaInspector {
    /**
     * Creates a schema inspector.
     *
     * @param connection Active database connection.
     * @param dialect SQL dialect implementation.
     */
    constructor(
        connection: any,
        dialect: any
    );

    /**
     * Reads the current database schema.
     */
    inspect(): Promise<any>;
}

/**
 * MySQL SQL dialect implementation.
 *
 * Converts SQL Connector schema and migration operations
 * into MySQL-compatible SQL.
 *
 * @example
 * ```ts
 * const dialect = new MySQLDialect();
 * ```
 */
export class MySQLDialect {
    /**
     * Creates the MySQL dialect.
     */
    constructor();
}

/**
 * PostgreSQL SQL dialect implementation.
 *
 * Converts SQL Connector schema and migration operations
 * into PostgreSQL-compatible SQL.
 *
 * @example
 * ```ts
 * const dialect = new PostgreSQLDialect();
 * ```
 */
export class PostgreSQLDialect {
    /**
     * Creates the PostgreSQL dialect.
     */
    constructor();
}

/**
 * Base error thrown by the migration system.
 *
 * Use `code` to distinguish migration failures programmatically.
 *
 * @example
 * ```ts
 * try {
 *   await Migration.migrate(options);
 * } catch (error) {
 *   if (error instanceof MigrationError) {
 *     console.error(error.code);
 *   }
 * }
 * ```
 */
export class MigrationError extends Error {
    /**
     * Machine-readable migration error code.
     */
    code: string;

    /**
     * Additional error metadata.
     */
    details?: any;
}

/**
 * Error raised when a migration contains destructive changes
 * that are not explicitly allowed.
 *
 * @example
 * ```ts
 * try {
 *   await plan.execute();
 * } catch (error) {
 *   if (error instanceof DestructiveMigrationError) {
 *     console.warn("Destructive migration blocked");
 *   }
 * }
 * ```
 */
export class DestructiveMigrationError extends MigrationError {}

/**
 * Error raised when a persisted migration checksum does not match
 * the checksum calculated from its current contents.
 *
 * This protects the migration history from unexpected modifications.
 */
export class MigrationChecksumError extends MigrationError {}

/**
 * Main migration manager.
 *
 * Migration coordinates schema inspection, schema comparison,
 * migration generation, persistence, backups and execution.
 *
 * @example
 * ```ts
 * const migration = new Migration({
 *   models: [UserModel],
 *   dialect: "mysql",
 *   directory: "./migrations"
 * });
 *
 * const plan = await migration.plan();
 *
 * if (plan.hasChanges()) {
 *   await plan.execute();
 * }
 * ```
 *
 * @example Generate and execute a migration
 * ```ts
 * await Migration.migrate({
 *   models: [UserModel],
 *   dialect: "mysql"
 * });
 * ```
 */
export class Migration {
    /**
     * Active database connection.
     */
    connection: any;

    /**
     * SQL dialect used by the migration.
     */
    dialect: any;

    /**
     * Models included in schema comparison.
     */
    models: Array<Model<any>>;

    /**
     * Persistent migration store.
     */
    store: MigrationStore;

    /**
     * Database schema inspector.
     */
    inspector: SchemaInspector;

    /**
     * Schema difference calculator.
     */
    differ: SchemaDiffer;

    /**
     * Migration executor.
     */
    runner: MigrationRunner;

    /**
     * Creates a migration manager.
     *
     * @param options Migration configuration.
     */
    constructor(options?: MigrationOptions);

    /**
     * Generates a migration plan without executing it.
     *
     * @param options Optional migration configuration.
     * @returns Generated migration plan.
     *
     * @example
     * ```ts
     * const plan = await migration.plan({
     *   name: "add-user-status"
     * });
     *
     * console.log(plan.sql);
     * ```
     */
    plan(
        options?: MigrationOptions & {
            id?: string;
            name?: string;
        }
    ): Promise<MigrationPlan>;

    /**
     * Generates and executes a migration.
     *
     * @param options Migration and execution configuration.
     *
     * @example
     * ```ts
     * await migration.migrate({
     *   name: "add-user-status",
     *   approve: true
     * });
     * ```
     */
    migrate(
        options?: MigrationOptions & {
            id?: string;
            name?: string;
            approve?: boolean;
            requireApproval?: boolean;
        }
    ): Promise<any>;

    /**
     * Returns the current migration status/history.
     *
     * @returns Applied migrations and their metadata.
     *
     * @example
     * ```ts
     * const status = await migration.status();
     *
     * console.table(status);
     * ```
     */
    status(): Promise<any[]>;

    /**
     * Removes expired migration files and backups.
     *
     * @returns Number of removed files.
     */
    cleanup(): Promise<number>;

    /**
     * Generates a migration plan using a temporary migration manager.
     *
     * @example
     * ```ts
     * const plan = await Migration.plan({
     *   models: [UserModel],
     *   dialect: "mysql"
     * });
     * ```
     */
    static plan(
        options?: MigrationOptions & {
            id?: string;
            name?: string;
        }
    ): Promise<MigrationPlan>;

    /**
     * Generates and executes a migration using a temporary migration manager.
     *
     * @example
     * ```ts
     * await Migration.migrate({
     *   models: [UserModel],
     *   dialect: "mysql"
     * });
     * ```
     */
    static migrate(
        options?: MigrationOptions & {
            id?: string;
            name?: string;
            approve?: boolean;
            requireApproval?: boolean;
        }
    ): Promise<any>;

    /**
     * Reads migration status using a temporary migration manager.
     *
     * @example
     * ```ts
     * const migrations = await Migration.status({
     *   dialect: "mysql"
     * });
     * ```
     */
    static status(
        options?: MigrationOptions
    ): Promise<any[]>;
}

/**
 * Represents a row returned from a Model query.
 *
 * ModelInstance provides operations that act on the current row.
 *
 * @example
 * ```ts
 * const user = await userModel.find({
 *   limit: 1
 * });
 *
 * await user[0].updateOne({
 *   active: false
 * });
 * ```
 */
export class ModelInstance<
    TData extends Record<string, any> = Record<string, any>
> {
    /**
     * Database model name.
     */
    name: string;

    /**
     * Row data.
     */
    data: TData;

    /**
     * Schema associated with the row.
     */
    schema?: SchemaLike<any>;

    /**
     * Creates a model instance.
     *
     * @param name Model/table name.
     * @param data Row data.
     * @param schema Optional schema definition.
     */
    constructor(
        name: string,
        data: TData,
        schema?: SchemaLike<any>
    );

    /**
     * Updates the current database row.
     *
     * @param model Values to update.
     * @returns Number of affected rows.
     *
     * @example
     * ```ts
     * await user.updateOne({
     *   active: false
     * });
     * ```
     */
    updateOne(
        model: Partial<TData>
    ): Promise<number>;

    /**
     * Deletes a database row matching the supplied filter.
     *
     * @param filter Conditions identifying the row.
     * @returns Number of affected rows.
     *
     * @example
     * ```ts
     * await user.delete({
     *   id: user.data.id
     * });
     * ```
     */
    delete(
        filter: Record<string, any>
    ): Promise<number>;

    /**
     * Executes a custom SQL query associated with this model instance.
     *
     * @param custom SQL query.
     * @returns Query result.
     *
     * @example
     * ```ts
     * const result = await user.customRequest(
     *   "SELECT NOW() AS current_time"
     * );
     * ```
     */
    customRequest<TResult = any>(
        custom: string
    ): Promise<TResult>;
}

/**
 * Active SQL Connector client object.
 *
 * This object is reserved for the connector runtime and shared client state.
 */
export const client: Record<string, any>;