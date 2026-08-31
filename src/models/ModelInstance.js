const { error } = require("@mlagie/logger");
const { getConnexion } = require("../db/connexion");
const { getSafe, setSafe } = require("../utils/security/safe");
const { buildQueryParts } = require("../utils/buildQuery/buildQuery");

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
        // 1. Paramétrisation sécurisée de la clause SET
        const setKeys = Object.keys(model);
        if (setKeys.length === 0) return 0;

        const setClause = setKeys.map(key => `\`${key}\` = ?`).join(', ');
        const values = Object.values(model); // On accumule les valeurs à modifier

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

        // 2. Utilisation de la nouvelle fonction buildQueryParts pour générer le WHERE sécurisé
        // On passe les critères dans la clé 'where' requise par la fonction
        const { sql: whereClause, values: whereValues } = buildQueryParts({ where: targetCriteria });

        // 3. Fusion ordonnée des valeurs : d'abord les données du SET, puis celles du WHERE
        values.push(...whereValues);

        // Construction de la requête préparée MySQL finale avec des placeholders "?" partout
        const sql_request = `UPDATE \`${this._name}\` SET ${setClause} ${whereClause}`;

        try {
            // Envoi combiné de la structure et du tableau complet de valeurs ordonnées
            const [result] = await getConnexion().promise().execute(sql_request, values);

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
        } catch (err) {
            error(`Error executing query updateOne: ${err}`);
            throw err;
        }
    }

    /**
     * Deletes a single entry in the database table.
     * @param {Object} model An object containing the key-value pairs to use for deletion.
     * @returns {Promise<Object>} A promise that resolves with the data deleted.
     * @throws {Error} Throws an error if the deletion fails.
     */
    async delete(filter) {
        const { sql: whereClause, values } = buildQueryParts(filter);

        const sql_request = `DELETE FROM ${this._name} ${whereClause}`;

        const rows = await getConnexion().promise().execute(sql_request, values).catch((err) => {
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
        const { sql: whereClause, values } = buildQueryParts(this.getRecordData());
        const sql_request = `DELETE FROM ${this._name} ${whereClause}`;
        const rows = await getConnexion().promise().execute(sql_request, values).catch((err) => {
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