const { error } = require("@mlagie/logger");
const { getConnexion } = require("../db/connexion");
const { getSafe, setSafe } = require("../utils/security/safe");
const { buildQueryParts } = require("../utils/buildQuery/buildQuery");
const { getDialect } = require("../db/dialects");

/**
 * Represents an instance of a database model.
 * @class
 */
class ModelInstance {
    /**
     * Creates an instance of ModelInstance.
     * @param {string} name The name of the database table.
     * @param {Object} data The instance data.
     * @param {Object|null} [schema=null] The schema for the instance, if available.
     */
    constructor(name, data, schema = null) {
        Object.defineProperties(this, {
            _name: {
                value: name,
                writable: true,
                configurable: true,
                enumerable: false
            },
            _data: {
                value: data,
                writable: true,
                configurable: true,
                enumerable: false
            },
            _schema: {
                value: schema,
                writable: true,
                configurable: true,
                enumerable: false
            }
        });
        const row = this._getTargetRow();
        if (row && typeof row === 'object') {
            Object.keys(row).forEach(key => {
                Object.defineProperty(this, key, {
                    get: () => {
                        const val = getSafe(row, key);
                        if (typeof val === 'string' && val.trim().startsWith('{') && val.trim().endsWith('}')) {
                            try { return JSON.parse(val); } catch { return val; }
                        }
                        return val;
                    },
                    set: (newVal) => {
                        setSafe(row, key, newVal);
                    },
                    enumerable: true,
                    configurable: true
                });
            });
        }
    }

    /**
     * Extract the actual data row by managing the database driver's structure [rows, fields]
     * @private
     */
    _getTargetRow() {
        const rows = Array.isArray(this._data) && Array.isArray(this._data[0]) ? this._data[0] : this._data;
        return Array.isArray(rows) ? rows[0] : rows;
    }

    getRecordData() {
        return Array.isArray(this._data) ? this._data[0] ?? this._data : this._data;
    }

    toJSON() {
        return this.getRecordData();
    }

    /**
     * Updates a single entry in the database table.
     * 
     * @param {Object} model An object containing the key-value pairs to use for updating.
     * @returns {int} A promise that resolves with updated data.
     * @throws {Error} Throws an error if the update fails.
     */
    async updateOne(model) {
        const setKeys = Object.keys(model);
        if (setKeys.length === 0) return 0;

        const dialect = getDialect();
        const values = Object.values(model);

        const setClause = setKeys.map((key, i) => {
            return `${dialect.escape(key)} = ${dialect.getPlaceholder(i)}`;
        }).join(', ');

        let targetCriteria;
        try {
            const recordsArray = this.getRecordData();
            let rawRec = Array.isArray(recordsArray) ? recordsArray[0] : recordsArray;

            if (typeof rawRec === 'string') {
                rawRec = JSON.parse(rawRec);
            }
            const rec = rawRec;

            const schemaDict = this._schema && this._schema.schemaDict ? this._schema.schemaDict : null;
            if (schemaDict) {
                const pkKeys = Object.entries(schemaDict).filter(([, v]) => v && v.primary_key === true).map(([k]) => k);
                if (pkKeys.length > 0) {
                    const pkObj = {};
                    for (const k of pkKeys) {
                        if (rec && Object.prototype.hasOwnProperty.call(rec, k)) {
                            setSafe(pkObj, k, getSafe(rec, k));
                        }
                    }
                    if (Object.keys(pkObj).length > 0) targetCriteria = pkObj;
                }
            }
            if (!targetCriteria) targetCriteria = rec;
        } catch {
            const originalFallbackRec = this.getRecordData();
            let fallbackRec = originalFallbackRec;
            if (Array.isArray(fallbackRec)) fallbackRec = fallbackRec[0];
            if (typeof fallbackRec === 'string') {
                try { fallbackRec = JSON.parse(fallbackRec); } catch { fallbackRec = originalFallbackRec; }
            }
            targetCriteria = fallbackRec;
        }

        const { sql: whereClause, values: whereValues } = buildQueryParts({ where: targetCriteria }, setKeys.length);
        values.push(...whereValues);

        const sql_request = `UPDATE ${dialect.escape(this._name)} SET ${setClause} ${whereClause}`;

        try {
            const result = await dialect.execute(getConnexion(), sql_request, values);
            const affected = dialect.getAffectedRows(result);

            if (affected > 0) {
                const record = this.getRecordData();
                if (Array.isArray(this._data)) {
                    if (this._data[0] && typeof this._data[0] === 'object') Object.assign(this._data[0], model);
                } else if (record && typeof record === 'object') {
                    Object.assign(this._data, model);
                }
            }

            return affected; // On retourne le nombre exact de lignes modifiées (0 ou plus)
        } catch (err) {
            error(`Error executing query updateOne: ${err}`);
            throw err;
        }
    }

    /**
     * Builds the criteria identifying the current row.
     * Uses only the primary key column(s) declared in the schema (`primary_key: true`).
     * Falls back to the whole record when the schema has no primary key, or when
     * the record does not contain all of its primary key columns.
     * @private
     * @returns {Object|null} The criteria object, or null if the record is unusable.
     */
    _getIdentityCriteria() {
        let rec = this._getTargetRow();
        if (typeof rec === 'string') {
            try { rec = JSON.parse(rec); } catch { return null; }
        }
        if (!rec || typeof rec !== 'object') return null;

        const schemaDict = this._schema && this._schema.schemaDict ? this._schema.schemaDict : null;
        if (schemaDict) {
            const pkKeys = Object.entries(schemaDict)
                .filter(([, v]) => v && v.primary_key === true)
                .map(([k]) => k);

            // Every PK column must be present, otherwise a partial composite key could match several rows
            if (pkKeys.length > 0 && pkKeys.every(k => Object.prototype.hasOwnProperty.call(rec, k))) {
                const pkObj = {};
                for (const k of pkKeys) setSafe(pkObj, k, getSafe(rec, k));
                return pkObj;
            }
        }

        return rec;
    }

    /**
     * Deletes a single entry in the database table.
     * Without argument, deletes the current row identified by its primary key only
     * (or by the whole record if the schema defines no primary key).
     * @param {Object} [filter] Options passed to the query builder (e.g. `{ where: {...} }`).
     * @returns {Promise<number>} 1 if a row was deleted, 0 otherwise.
     * @throws {Error} Throws an error if the deletion fails, or if the current row cannot be identified.
     */
    async delete(filter) {
        if (filter === undefined) {
            const criteria = this._getIdentityCriteria();
            if (!criteria || Object.keys(criteria).length === 0) {
                throw new Error("Cannot delete: no primary key or record data available to identify the row.");
            }
            filter = { where: criteria };
        }

        const { sql: whereClause, values } = buildQueryParts(filter);
        const sql_request = `DELETE FROM ${getDialect().escape(this._name)} ${whereClause}`;
        const result = await getDialect().execute(getConnexion(), sql_request, values).catch((err) => {
            error(`Error executing query delete: ${err}`);
            throw err;
        });

        return getDialect().getAffectedRows(result) === 0 ? 0 : 1;
    }

    /**
     * Runs a custom SQL_request query.
     * @param {string} custom The custom SQL_request query to execute.
     * @returns {Promise<void>} A promise that resolves when the query is executed.
     * @throws {Error} Throws an error if query execution fails.
     */
    async customRequest(custom) {
        const rows = await getDialect().execute(getConnexion(), custom).catch((err) => {
            error(`Error executing query: ${err}`);
            throw err;
        });

        if (!rows || rows.length === 0) return 0;

        return new ModelInstance(this._name, rows, this._schema)._data;
    }
}

module.exports = { ModelInstance }