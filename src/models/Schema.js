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
    class Schema {
        constructor(schemaDict) {
            this.schemaDict = schemaDict;
        }
    }

    module.exports = { Schema }