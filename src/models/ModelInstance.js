const { error, logs } = require("@mlagie/logger");
const { getConnexion } = require("../db/connexion");
const formatObject = require("../utils/formatObject");
const generateCondition = require("../utils/generateCondition");
const { getSafe, setSafe } = require("../utils/security/safe");

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
                enumerable: true
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
        const setClause = generateCondition(formatObject(model), true);

        let whereClause;
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
                        if (rec && Object.prototype.hasOwnProperty.call(rec, k)) setSafe(pkObj, k, getSafe(rec, k));
                    }
                    if (Object.keys(pkObj).length > 0) whereClause = generateCondition(formatObject(pkObj), false, this._schema);
                }
            }
            if (!whereClause) whereClause = generateCondition(formatObject(rec), false, this._schema);
        } catch {
            const originalFallbackRec = this.getRecordData();
            let fallbackRec = originalFallbackRec;
            if (Array.isArray(fallbackRec)) fallbackRec = fallbackRec[0];
            if (typeof fallbackRec === 'string') { try { fallbackRec = JSON.parse(fallbackRec); } catch { fallbackRec = originalFallbackRec; } }
            whereClause = generateCondition(formatObject(fallbackRec), false, this._schema);
        }

        const sql_request = `UPDATE ${this._name} SET ${setClause} WHERE ${whereClause}`;
        const [result] = await getConnexion().promise().execute(sql_request).catch((err) => {
            error(`Error executing query updateOne: ${err}`);
            throw err;
        });

        const affected = result && (result.affectedRows !== undefined ? result.affectedRows : 0);

        if (affected > 0) {
            const record = this.getRecordData();
            if (Array.isArray(this._data)) {
                if (this._data[0] && typeof this._data[0] === 'object') Object.assign(this._data[0], model);
            } else if (record && typeof record === 'object') {
                Object.assign(this._data, model);
            }
        }

        return affected;
    }

    /**
     * Deletes a single entry in the database table.
     * @param {Object} model An object containing the key-value pairs to use for deletion.
     * @returns {Promise<Object>} A promise that resolves with the data deleted.
     * @throws {Error} Throws an error if the deletion fails.
     */
    async delete(filter) {
        const sql_request = `DELETE FROM ${this._name} WHERE ${generateCondition(formatObject(filter))}`;

        const rows = await getConnexion().promise().execute(sql_request).catch((err) => {
            error(`Error executing query delete: ${err}`);
            throw err;
        });

        return rows[0].affectedRows === 0 ? 0 : 1;
    }

    /**
     * Deletes a single entry in the database table based on the instance data.
     * @returns {Promise<number>} A promise that resolves to the number of rows deleted.
     * @throws {Error} Throws an error if the deletion fails.
     */
    async deleteOne() {
        const sql_request = `DELETE FROM ${this._name} WHERE ${generateCondition(formatObject(this.getRecordData()))}`;
        const rows = await getConnexion().promise().execute(sql_request).catch((err) => {
            error(`Error executing query deleteOne: ${err}`);
            throw err;
        });

        return rows[0].affectedRows === 0 ? 0 : 1;
    }

    /**
     * Runs a custom SQL_request query.
     * @param {string} custom The custom SQL_request query to execute.
     * @returns {Promise<void>} A promise that resolves when the query is executed.
     * @throws {Error} Throws an error if query execution fails.
     */
    async customRequest(custom) {
        const rows = await getConnexion().promise().execute(custom).catch((err) => {
            error(`Error executing query: ${err}`);
            throw err;
        });

        if (rows[0].length == 0) return 0;

        return new ModelInstance(this._name, rows[0], this._schema)._data;
    }
}

module.exports = { ModelInstance }