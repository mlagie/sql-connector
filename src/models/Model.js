const { logs, error } = require("@mlagie/logger");
const { sqlTypeMap } = require("../utils/sqlTypeMap");
const { getConnexion } = require("../db/connexion");
const generateCondition = require("../utils/generateCondition");
const formatObject = require("../utils/formatObject");
const { ModelInstance } = require("./ModelInstance");
const { buildSelect, buildQueryParts } = require("../utils/buildQuery/buildQuery");
const { getSafe, setSafe } = require("../utils/security/safe");
const { escapeIdentifier, escapeIdentifierList } = require("../utils/sql");

function getFieldType(field) {
    if (typeof field === "object") {
        if (field.type && field.type.name !== undefined) return field.type.name;
        else if (field.type !== undefined) return field.type;
        return undefined;
    }
    if (field && field.name !== undefined) return field.name;
}

function isDateLikeType(fieldType) {
    const normalizedType = String(fieldType ?? "").toLowerCase();
    return ["date", "datetime", "timestamp", "now"].includes(normalizedType);
}

function isSqlTemporalDefault(defaultValue) {
    if (typeof defaultValue !== "string") return false;

    const normalizedValue = defaultValue.trim().toUpperCase();
    return ["CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP()", "NOW()"].includes(normalizedValue);
}

function formatDefaultSql(defaultValue, fieldType) {
    if (defaultValue === undefined) return null;
    if (defaultValue === null) return "DEFAULT NULL";

    if (typeof defaultValue === "function") {
        if (isDateLikeType(fieldType)) return "DEFAULT CURRENT_TIMESTAMP";
        return formatDefaultSql(defaultValue(), fieldType);
    }

    if (defaultValue instanceof Date) {
        const formattedDate = defaultValue.toISOString().slice(0, 19).replace("T", " ");
        return `DEFAULT "${formattedDate}"`;
    }

    if (isSqlTemporalDefault(defaultValue)) return "DEFAULT CURRENT_TIMESTAMP";
    if (typeof defaultValue === "string") return `DEFAULT "${defaultValue.replace(/"/g, '\\"')}"`;
    if (typeof defaultValue === "number" || typeof defaultValue === "bigint") return `DEFAULT ${defaultValue}`;
    if (typeof defaultValue === "boolean") return `DEFAULT ${defaultValue ? 1 : 0}`;
    if (typeof defaultValue === "object") return `DEFAULT "${JSON.stringify(defaultValue).replace(/"/g, '\\"')}"`;

    return `DEFAULT "${String(defaultValue).replace(/"/g, '\\"')}"`;
}

const reservedKeywords = ['ADD', 'ALL', 'ALTER', 'AND', 'AS', 'ASC', 'BETWEEN', 'BY', 'CASE', 'CHECK', 'COLUMN', 'CONSTRAINT', 'CREATE', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'ELSE', 'END', 'ESCAPE', 'EXCEPT', 'EXISTS', 'FOR', 'FOREIGN', 'FROM', 'FULL', 'GROUP', 'HAVING', 'IN', 'INNER', 'INSERT', 'INTERSECT', 'INTO', 'IS', 'JOIN', 'LEFT', 'LIKE', 'LIMIT', 'NOT', 'NULL', 'ON', 'OR', 'ORDER', 'OUTER', 'PRIMARY', 'REFERENCES', 'RIGHT', 'SELECT', 'SET', 'SOME', 'TABLE', 'THEN', 'UNION', 'UNIQUE', 'UPDATE', 'VALUES', 'WHEN', 'WHERE'];

/**
 * Checks if a table name is a reserved keyword.
 * 
 * @param {string} tableName The name of the table to be checked.
 * @returns {boolean} `true` if the table name is a reserved keyword, otherwise `false`.
 * 
 * @example
 * const isReserved = ifReservedKeywords('SELECT');
 * console.log(isReserved); // true
 *
 * @example
 * const isReserved = ifReservedKeywords('myTable');
 * console.log(isReserved); // false
 */
function ifReservedKeywords(tableName) {
    if (reservedKeywords.includes(tableName.toUpperCase())) {
        return true;
    }
    return false;
}

function getColumnDefinition(fieldName, field) {
    if (field.primary_key && field.unique) {
        throw new Error(`Field '${fieldName}' cannot be both PRIMARY KEY and UNIQUE.`);
    }

    const fieldType = getFieldType(field);
    let colDef;

    if (Array.isArray(field.enum) && field.enum.length > 0) {
        const enumValues = field.enum.map(v => `'${v.replace(/'/g, "''")}'`).join(", ");
        colDef = `ENUM(${enumValues})`;
    } else {
        const type = getSafe(sqlTypeMap, fieldType);
        if (!type) throw new Error(`Field ${fieldName} has unsupported type ${fieldType}.`);
        colDef = `${type}${(type == "VARCHAR" || type == "INT") ? `(${field.length > 0 ? field.length : 255})` : ""}`;
    }
    if (field.required) colDef += ' NOT NULL';
    const defaultDefinition = formatDefaultSql(field.default, fieldType);
    if (defaultDefinition !== null) colDef += ` ${defaultDefinition}`;
    if (field.unique) colDef += ' UNIQUE';
    if (field.auto_increment) colDef += ' AUTO_INCREMENT';
    if (field.primary_key) colDef += ' PRIMARY KEY'
    if (typeof field.customize === 'string' && field.customize.length != 0) colDef += ` ${field.customize}`;
    return `${escapeIdentifier(fieldName)} ${colDef}`;
}

/**
 * Represents a database model.
 * @class
 */
class Model {
    static sqlTypeMap = sqlTypeMap;
    static pendingModels = [];

    /**
     * Creates an instance of Model.
     * @param {string} name The name of the database table.
     * @param {Object} schema The schema of the database table.
     */
    constructor(name, schema) {
        this.name = name;
        this.schema = schema;

        Model.pendingModels.push(this);
    }

    /**
     * Synchronizes all tables with their JS schemas (creation + adding missing columns).
     * @returns {Promise<void>}
     */
    static async syncAllTables() {
        const dependencies = {};
        const modelMap = {};

        for (const model of Model.pendingModels) {
            modelMap[model.name] = model;
            dependencies[model.name] = [];
            for (const [_, field] of Object.entries(model.schema.schemaDict)) {
                if (field && field.foreignKey) {
                    const refTable = field.foreignKey.split('(')[0].trim();
                    dependencies[model.name].push(refTable);
                }
            }
        }

        const conn = getConnexion();

        const sorted = [];
        const visited = {};
        function visit(table) {
            if (getSafe(visited, table) === true) return;
            if (getSafe(visited, table) === 'temp') throw new Error('Cyclic foreign key dependency detected');
            setSafe(visited, table, 'temp');
            const deps = getSafe(dependencies, table)
            for (const dep of deps) {
                if (getSafe(modelMap, dep)) visit(dep);
            }
            setSafe(visited, table, true);
            sorted.push(table);
        }
        for (const table of Object.keys(dependencies)) {
            if (!getSafe(visited, table)) visit(table);
        }

        for (const table of sorted) {
            const model = getSafe(modelMap, table);

            try {
                await conn.promise().execute(model.generateCreateTableStatement(model.schema.schemaDict));
                await logs(`The table ${model.name} has been created or already exists`);
            } catch (err) {
                error(`Error creating table: ${err} with table name: ${model.name}`);
                throw err;
            }
        }
        Model.pendingModels = [];
    }

    /**
     * Generates an SQL_request statement to create a table based on the provided schema.
     * 
     * @param {Object} schema The schema of the database table.
     * @returns {string} A character string representing the SQL_request statement to create the table.
     */
    generateCreateTableStatement(schema) {
        let foreignKey = [];
        const columns = Object.keys(schema).map(fieldName => {
            const field = getSafe(schema, fieldName);
            let lengthDefault = 255;

            if (!field.type && typeof field == "object" && !(Array.isArray(field.enum) && field.enum.length > 0)) throw new Error(`Field ${fieldName} has no type defined.`);

            const fieldType = getFieldType(field);

            if (field.type && typeof field == "object") {
                return getColumnDefinition(fieldName, field);
            }
            if (Array.isArray(field.enum) && field.enum.length > 0) {
                const enumValues = field.enum.map(v => `'${v.replace(/'/g, "''")}'`).join(", ");
                return `${fieldName} ENUM(${enumValues})`;
            }

            const type = getSafe(sqlTypeMap, fieldType);

            if (!type) throw new Error(`Field ${fieldName} has unsupported type ${field}`);

            return `${fieldName} ${type == "VARCHAR" ? `${type}(${lengthDefault})` : type}`;
        });
        if (ifReservedKeywords(this.name)) {
            error("Error: Invalid table name. Please choose a different name that is not a reserved keyword in SQL_request");
            return;
        }
        return `CREATE TABLE IF NOT EXISTS ${escapeIdentifier(this.name)} (${columns.join(', ')}${foreignKey.length > 0 ? ", " + foreignKey.join(', ') : ""}) ENGINE=InnoDB`;
    }

    /**
     * Saves data to the database table.
     * @param {Object} data The data to insert into the table.
     * @returns {Promise<Object>} A promise that resolves with the result of the insertion.
     * @throws {Error} Throws an error if the insert fails.
     */
    async save(data) {
        const keys = Object.keys(data);
        const sql_request = `INSERT INTO ${escapeIdentifier(this.name)} (${escapeIdentifierList(keys)}) VALUES (${keys.map(() => "?").join(", ")})`;

        try {
            const result = await getConnexion().promise().execute(sql_request, Object.values(data));
            return result[0];
        } catch (err) {
            error(`Error inserting data into ${this.name}: ${err}`);
            throw err;
        }
    }

    /**
     * @typedef {Object} SelectAggregation
     * @property {string} [col] - Le nom brut de la colonne à récupérer sans agrégation.
     * @property {string} [sum] - Le nom de la colonne à additionner (ex: "total_runs").
     * @property {string} [distinct] - Applique le mot-clé DISTINCT sur la colonne spécifiée.
     * @property {string | string[] | Object} [count] - Compte les lignes selon le format fourni :
     * - `string`: Compte toutes les valeurs non-nulles de cette colonne (ex: "id").
     * - `string[]`: Compte les combinaisons uniques de plusieurs colonnes (COUNT DISTINCT col1, col2).
     * - `Object`: Comptage conditionnel (CASE WHEN clé = valeur THEN 1 END). Ex: { deletedAt: null }.
     * @property {string[]} [dateFormat] - Tableau au format [colonne, format_mysql] (ex: ["date_day", "%Y-%m-%d"]).
     * @property {string} [as] - Alias d'extraction SQL pour le champ (ex: "total_runs" ou "period").
     */

    /**
     * @typedef {Object} OrderByOption
     * @property {string} field - Le nom de la colonne sur laquelle appliquer le tri.
     * @property {'ASC'|'DESC'} [direction] - La direction du tri (Par défaut : 'ASC').
     */

    /**
     * @typedef {Object} JoinOption
     * @property {string} table - Le nom de la table cible avec laquelle effectuer la jointure.
     * @property {string} on - La condition de correspondance de la jointure (ex: "ProjectPipelines.project_id = Projects.id").
     * @property {string} [alias] - Alias SQL optionnel à donner à la table jointe.
     * @property {'INNER'|'LEFT'|'RIGHT'} [type] - Le type de jointure SQL à appliquer (Par défaut : 'INNER').
     */

    /**
     * Récupère plusieurs entrées de la table correspondante.
     * @param {Object} [options] - Options de configuration de la requête SQL.
     * @param {Array<string|SelectAggregation>} [options.select] - Liste des champs, transformations ou agrégations à retourner.
     * @param {Object|string} [options.where] - Filtres structurés (objet clé/valeur) ou clause WHERE brute sous forme de chaîne.
     * @param {string[]} [options.groupBy] - Tableau de colonnes ou d'expressions pour grouper les résultats (ex: ["period"]).
     * @param {Array<string|OrderByOption>} [options.orderBy] - Règles de tri des résultats.
     * @param {number} [options.limit] - Limite maximale du nombre de lignes à retourner.
     * @param {JoinOption | JoinOption[]} [options.join] - Option(s) de jointure avec d'autres tables de la base de données.
     * @returns {Promise<Array<ModelInstance>>}
     */
    async find(options = {}) {
        let { select, join } = options;

        if (join && join.table && select) {
            select = select.map(item => {
                if (typeof item === 'string') {
                    if (!item.includes('.')) {
                        if (item.startsWith('name')) {
                            return `${escapeIdentifier(join.table)}.${escapeIdentifier(item)}`;
                        }
                        return `${escapeIdentifier(this.name)}.${escapeIdentifier(item)}`;
                    }
                }
                return item;
            });
        }
        let joinClause = "";
        if (join && join.table && join.on) {
            joinClause = ` INNER JOIN ${escapeIdentifier(join.table)} ON ${join.on}`;
        }

        const query = `SELECT ${buildSelect(select)} FROM ${escapeIdentifier(this.name)}${joinClause} ${buildQueryParts(options)}`;

        try {
            const result = await getConnexion().promise().execute(query);
            const rows = result && Array.isArray(result) ? result[0] : result;

            if (!rows || rows.length === 0) return [];

            return rows.map(row => new ModelInstance(this.name, row, this.schema));
        } catch (err) {
            error(`Error executing auto-prefixed find: ${err}`);
            throw err;
        }
    }

    /**
     * Counts the number of records matching the given filter.
     * @param {Object} filter The filter criteria for the query. Should be an object where keys are column names and values are the values to filter by.
     * @returns {Promise<number>} - A promise that resolves to the number of matching records.
     */
    async count(filter) {
        try {
            const rows = await getConnexion().promise().execute(`SELECT COUNT(*) as count FROM ${escapeIdentifier(this.name)} ${filter != undefined ? `WHERE ${generateCondition(formatObject(filter))}` : ""}`);
            const resultRows = rows && Array.isArray(rows) ? rows[0] : [];

            if (!resultRows || resultRows.length === 0) return 0;

            const firstRow = resultRows[0];
            if (!firstRow || typeof firstRow !== "object") return Number(firstRow) || 0;

            const countValue = firstRow.count ?? firstRow["COUNT(*)"] ?? firstRow[Object.keys(firstRow)[0]];
            return Number(countValue) || 0;
        } catch (err) {
            error(`Error executing query count: ${err}`);
            throw err;
        }
    }

    /**
     * Runs a custom SQL_request query.
     * @param {string} custom The custom SQL_request query to execute.
     * @returns {Promise<ModelInstance>} A promise that resolves when the query is executed.
     * @throws {Error} Throws an error if query execution fails.
     */
    async customRequest(custom, custom_err_name = "") {
        try {
            const rows = await getConnexion().promise().execute(custom);

            if (rows[0].length == 0) return 0;

            return new ModelInstance(this.name, rows[0], this.schema);
        } catch (err) {
            error(`Error executing query ${custom_err_name}: ${err}`);
            throw err;
        }
    }

    /**
     * Deletes an entry from the SQL table that matches the provided filter.
     *
     * @param {Object} filter An object representing the filter conditions for deletion.
     * @returns {Promise<number>} A promise that resolves to 0 if no rows were deleted,
     * or to a ModelInstance representing the deleted row.
     * @throws {Error} Throws an error if the SQL query fails.
     */
    async delete(filter) {
        const sql_request = `DELETE FROM ${escapeIdentifier(this.name)} WHERE ${generateCondition(formatObject(filter))}`;
        return new Promise((resolve, reject) => {
            getConnexion().promise().execute(sql_request).then((rows) => {
                if (rows[0].affectedRows === 0) return resolve(0);

                return resolve(1);
            }).catch((err) => {
                error(`Error executing query delete: ${err}`);
                reject(err)
            });
        });
    }

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
    async dropTable() {
        const sql_request = `DROP TABLE IF EXISTS ${escapeIdentifier(this.name)};`;

        try {
            await getConnexion().promise().execute(sql_request);
        } catch (err) {
            error(`Error executing query drop: ${err}`);
            throw err;
        }
    }

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
    async generate_uuid(var_uuid = "uuid") {
        try {
            const uuid = (await getConnexion().promise().execute("SELECT UUID();"))[0][0]["UUID()"];
            const sql_request = `SELECT COUNT(*) FROM ${escapeIdentifier(this.name)} WHERE ${escapeIdentifier(var_uuid)} = ?;`;
            const [rows] = await getConnexion().promise().execute(sql_request, [uuid]);

            if (rows[0]['COUNT(*)'] == 0) return uuid;
            return null;
        } catch (err) {
            error(`Error executing query gen_uuid: ${err}`);
            return null; // Retourne null en cas de plantage SQL
        }
    }
}

module.exports = { Model }