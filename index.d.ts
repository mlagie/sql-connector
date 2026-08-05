import { PoolOptions } from "mysql2";

export type SqlType =
    | "String"
    | "Number"
    | "Boolean"
    | "Date"
    | "Object"
    | "Array"
    | "Now"
    | "Float"
    | "Text"
    | "DateTime"
    | "Timestamp";
export type SqlTypeConstructor =
    | StringConstructor
    | NumberConstructor
    | BooleanConstructor
    | DateConstructor
    | ObjectConstructor
    | ArrayConstructor;

export type SchemaTypeInput = SqlType | { name: SqlType } | SqlTypeConstructor;

export interface SchemaField {
    type: SchemaTypeInput;
    length?: number;
    required?: boolean;
    default?: any | SqlType | "CurrentTimestamp";
    unique?: boolean;
    auto_increment?: boolean;
    foreignKey?: string;
    enum?: string[];
    primary_key?: boolean;
    customize?: string;
}

export interface SchemaDict {
    [key: string]: SchemaField;
}

type NormalizeSqlType<T> =
    T extends { name: infer Name }
        ? NormalizeSqlType<Name>
        : T extends StringConstructor
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

type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

type InferFieldValue<TField> =
    InferSqlType<TField extends { type: infer T } ? T : TField>;

type InferFieldNullable<TField> =
    TField extends { required: true }
        ? false
        : TField extends { primary_key: true }
            ? false
            : TField extends { auto_increment: true }
                ? false
                : HasKey<TField, "default"> extends true
                    ? false
                    : true;

export type InferSchema<TSchema extends SchemaDict> = {
    [K in keyof TSchema]: InferFieldNullable<TSchema[K]> extends true
        ? InferFieldValue<TSchema[K]> | null
        : InferFieldValue<TSchema[K]>;
};

export type SchemaLike<TSchema extends SchemaDict = SchemaDict> =
    | Schema<TSchema>
    | {
        schemaDict: TSchema;
        schema?: TSchema;
    };

export type ModelRecord<TData extends Record<string, any> = Record<string, any>> = ModelInstance<TData> & TData;

/**
 * Represents a database schema.
 * 
 * @example
 * const transferSchema = new Schema({
 *     token: {
 *         type: String,
 *         length: 50
 *     },
 *     mdp: {
 *         type: String,
 *         length: 15
 *     }
 * });
 */
export class Schema<TSchema extends SchemaDict = SchemaDict> {
    constructor(schemaDict: TSchema);
    schemaDict: TSchema;
    schema: TSchema;
}

/**
 * Establishes a connection to the database using a given configuration.
 * @param {Object} config Database connection configuration.
 * @param {string} config.host The database host.
 * @param {number} config.port The database port.
 * @param {string} config.user The username for the connection.
 * @param {string} config.password The password for the connection.
 * @param {string} config.database The name of the database.
 * @returns {Promise<void>} A promise that resolves when the connection is established.
 * 
 * @example
 * const config = {
 *   host: 'localhost',
 *   port: 6666,
 *   user: 'root',
 *   password: 'password',
 *   database: 'mydatabase'
 * };
 * await connect(config);
 */
export function connect(config: PoolOptions): Promise<void>;

/**
 * Closes the database connection.
 * This function terminates the active database connection and records a logging message
 * indicating whether the shutdown succeeded or failed.
 * 
 * @returns {Promise<void>} A promise that resolves when the connection is closed.
 *
 * @example
 * await logout();
 */
export function logout(): Promise<void>;

/**
 * Represents a database model.
 * @class
 */
export class Model<TSchema extends SchemaDict = SchemaDict> {
    static sqlTypeMap: Record<SqlType, string>;
    static pendingModels: Model[];
    name: string;
    schema: SchemaLike<TSchema>;
    constructor(name: string, schema: SchemaLike<TSchema>);
    /**
     * Creates all tables in the correct order based on foreign keys.
     * @returns {Promise<void>}
     */
    static syncAllTables(): Promise<void>;
    /**
     * Saves data to the database table.
     * @param {Object} data The data to insert into the table.
     * @returns {Promise<Object>} A promise that resolves with the result of the insertion.
     * @throws {Error} Throws an error if the insert fails.
     */
    save(data: Partial<InferSchema<TSchema>>): Promise<any>;
    /**
     * Retrieves multiple rows from the table.
     * @param {Object} [options] - Query options (attributes, where, order, limit).
     * @param {string[]} [options.select] - Fields to return.
     * @param {Object} [options.where] - Filters (key/value).
     * @param {Array} [options.order] - Example: [['points', 'DESC']]
     * @param {number} [options.limit] - Result limit.
     * @returns {Promise<Array<Object>>}
     */
    find(options?: {
        select?: string[];
        where?: Record<string, any> | Partial<InferSchema<TSchema>> | string;
        order?: [string, string][];
        limit?: number;
    }): Promise<Array<ModelRecord<InferSchema<TSchema>>>>;
    /**
     * 
     * @param {Object} filter The filter criteria for the query. Should be an object where keys are column names and values are the values to filter by.
     * @returns {Promise<ModelInstance|number>} - A promise that resolves to a `ModelInstance` if a record is found, or `0` if no records match the filter.
     */
    count(filter?: Record<string, any> | Partial<InferSchema<TSchema>>): Promise<number>;
    /**
     * Runs a custom SQL_request query.
     * @param {string} custom The custom SQL_request query to execute.
     * @returns {Promise<void>} A promise that resolves when the query is executed.
     * @throws {Error} Throws an error if query execution fails.
     */
    customRequest<TResult extends Record<string, any> = InferSchema<TSchema>>(custom: string): Promise<ModelRecord<TResult> | 0>;
    /**
     * Deletes a record from the SQL table corresponding to the provided filter.
     *
     * @async
     * @function delete
     * @param {Object} filter - An object representing the filter conditions for the deletion.
     * @returns {Promise<number>} A promise that resolves to 0 if no rows were deleted,
     * or an instance of ModelInstance representing the deleted row.
     * @throws {Error} Throws an error if the SQL query fails.
     */
    delete(filter: Record<string, any> | Partial<InferSchema<TSchema>>): Promise<number>;
    /**
     * Asynchronously drops a table if it exists in the database.
     *
     * This function constructs a SQL_request query to drop a table with the name specified
     * by the `this.name` property. It then executes the query using a promise-based
     * approach. If the query is successful, the result is logged to the console.
     * If an error occurs during the execution of the query, an error message is logged.
     *
     * @returns {Promise<void>} A promise that resolves when the query execution is complete.
     */
    dropTable(): Promise<void>;
    /**
     * Generates a unique UUID for the current model.
     *
     * This function generates a UUID using the SQL_request `UUID()` function and checks if the generated UUID
     * already exists in the database for the current model. If the UUID is unique, it is returned.
     * Otherwise, the function resolves to `null`.
     *
     * @returns {Promise<string|null>} A promise that resolves to a unique UUID string if successful, or `null` if an error occurs or the UUID is not unique.
     *
     * @example
     * const uuid = await model.generate_uuid();
     * if (uuid) {
     *     console.log(`Generated UUID: ${uuid}`);
     * } else {
     *     console.log('Failed to generate a unique UUID.');
     * }
     *
     * @throws {Error} If there is an error executing the SQL_request query.
     */
    generate_uuid(var_uuid?: string): Promise<string | null>;
}

/**
 * Represents an instance of a database model.
 * @class
 */
export class ModelInstance<TData extends Record<string, any> = Record<string, any>> {
    name: string;
    data: TData;
    schema?: SchemaLike<any>;
    constructor(name: string, data: TData, schema?: SchemaLike<any>);
    /**
     * Updates a single entry in the database table.
     * 
     * @param {Object} model An object containing the key-value pairs to use for updating.
     * @returns {int} A promise that resolves with updated data.
     * @throws {Error} Throws an error if the update fails.
     */
    updateOne(model: Partial<TData>): Promise<number>;
    /**
     * Deletes a single entry in the database table.
     * @param {Object} model An object containing the key-value pairs to use for deletion.
     * @returns {Promise<Object>} A promise that resolves with the data deleted.
     * @throws {Error} Throws an error if the deletion fails.
     */
    delete(filter: Record<string, any>): Promise<number>;
    /**
     * Deletes a single entry in the database table based on the instance data.
     * @returns {Promise<number>} A promise that resolves to the number of rows deleted.
     * @throws {Error} Throws an error if the deletion fails.
     */
    deleteOne(): Promise<number>;
    /**
     * Runs a custom SQL_request query.
     * @param {string} custom The custom SQL_request query to execute.
     * @returns {Promise<void>} A promise that resolves when the query is executed.
     * @throws {Error} Throws an error if query execution fails.
     */
    customRequest<TResult = any>(custom: string): Promise<TResult>;
}

export const client: Record<string, any>;
