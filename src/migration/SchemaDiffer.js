const { DestructiveMigrationError } = require("./errors");

function normalizeType(type) {
    const value = String(type ?? "").toLowerCase();

    const aliases = {
        string: "varchar",
        varchar: "varchar",
        character_varying: "varchar",
        "character varying": "varchar",

        integer: "integer",
        int: "integer",
        int4: "integer",

        bigint: "bigint",
        int8: "bigint",

        boolean: "boolean",
        bool: "boolean",

        float: "float",
        double: "float",
        double_precision: "float",

        date: "date",
        datetime: "datetime",
        timestamp: "timestamp",

        text: "text"
    };

    return aliases[value] || value;
}

function normalizeField(field) {
    if (!field) {
        return field;
    }

    return {
        type: normalizeType(field.type),
        length: field.length ?? null,
        required: Boolean(field.required),
        default: field.default ?? null,
        unique: Boolean(field.unique),
        auto_increment: Boolean(field.auto_increment),
        primary_key: Boolean(field.primary_key)
    };
}

function equivalentField(a, b) {
    return JSON.stringify(normalizeField(a)) === JSON.stringify(normalizeField(b));
}

class SchemaDiffer {
    constructor(options = {}) {
        this.allowDestructiveChanges = Boolean(
            options.allowDestructiveChanges
        );

        this.allowDropTables = Boolean(
            options.allowDropTables
        );
    }

    diff(desired, current) {
        const operations = [];

        const desiredTables = desired.tables || {};
        const currentTables = current.tables || {};

        for (const [tableName, desiredTable] of Object.entries(desiredTables)) {
            const desiredColumns = desiredTable.columns || {};

            // Table does not exist yet.
            if (!currentTables[tableName]) {
                operations.push({
                    type: "createTable",
                    table: tableName,
                    schema: desiredColumns
                });

                continue;
            }

            const currentTable = currentTables[tableName];
            const currentColumns = currentTable.columns || {};

            /*
             * First pass:
             * detect explicit renames using `oldname`.
             *
             * We deliberately do not guess renames.
             */
            const renameOperations = [];
            const renamedFrom = new Set();
            const renamedTo = new Set();

            for (const [newName, field] of Object.entries(desiredColumns)) {
                const oldName = field?.oldname;

                if (!oldName) {
                    continue;
                }

                if (oldName === newName) {
                    throw new Error(
                        `Column '${newName}' cannot have oldname equal to itself.`
                    );
                }

                if (!currentColumns[oldName]) {
                    throw new Error(
                        `Column '${oldName}' specified by oldname for '${tableName}.${newName}' does not exist.`
                    );
                }

                if (currentColumns[newName]) {
                    throw new Error(
                        `Cannot rename '${tableName}.${oldName}' to '${newName}' because '${newName}' already exists.`
                    );
                }

                if (renamedFrom.has(oldName)) {
                    throw new Error(
                        `Column '${tableName}.${oldName}' is used by multiple oldname declarations.`
                    );
                }

                if (renamedTo.has(newName)) {
                    throw new Error(
                        `Column '${tableName}.${newName}' has multiple rename declarations.`
                    );
                }

                const operation = {
                    type: "renameColumn",
                    table: tableName,
                    oldName,
                    newName
                };

                renameOperations.push(operation);
                renamedFrom.add(oldName);
                renamedTo.add(newName);
            }

            /*
             * Add rename operations first.
             */
            operations.push(...renameOperations);

            /*
             * Build a virtual representation of the current schema
             * after applying the renames.
             *
             * This is important because:
             *
             * email -> email_address
             *
             * followed by:
             *
             * email_address VARCHAR(255) -> VARCHAR(512)
             *
             * must generate:
             *
             * RENAME COLUMN
             * ALTER COLUMN
             */
            const virtualCurrentColumns = {
                ...currentColumns
            };

            for (const operation of renameOperations) {
                virtualCurrentColumns[operation.newName] =
                    virtualCurrentColumns[operation.oldName];

                delete virtualCurrentColumns[operation.oldName];
            }

            /*
             * Second pass:
             * detect additions and modifications.
             */
            for (const [columnName, field] of Object.entries(desiredColumns)) {
                const currentField = virtualCurrentColumns[columnName];

                if (!currentField) {
                    operations.push({
                        type: "addColumn",
                        table: tableName,
                        column: columnName,
                        field
                    });

                    continue;
                }

                if (!equivalentField(field, currentField)) {
                    operations.push({
                        type: "alterColumn",
                        table: tableName,
                        column: columnName,
                        field,
                        previous: currentField
                    });
                }
            }

            /*
             * Third pass:
             * detect removed columns.
             *
             * Renamed columns are excluded because their old name
             * intentionally disappears from the desired schema.
             */
            for (const currentName of Object.keys(currentColumns)) {
                if (renamedFrom.has(currentName)) {
                    continue;
                }

                if (!desiredColumns[currentName]) {
                    const operation = {
                        type: "dropColumn",
                        table: tableName,
                        column: currentName,
                        destructive: true
                    };

                    if (!this.allowDestructiveChanges) {
                        throw new DestructiveMigrationError(
                            `Dropping column '${tableName}.${currentName}' requires allowDestructiveChanges=true.`,
                            operation
                        );
                    }

                    operations.push(operation);
                }
            }
        }

        /*
         * Detect removed tables.
         */
        for (const tableName of Object.keys(currentTables)) {
            if (!desiredTables[tableName]) {
                const operation = {
                    type: "dropTable",
                    table: tableName,
                    destructive: true
                };

                if (!this.allowDropTables) {
                    throw new DestructiveMigrationError(
                        `Dropping table '${tableName}' requires allowDropTables=true.`,
                        operation
                    );
                }

                operations.push(operation);
            }
        }

        return operations;
    }
}

module.exports = {
    SchemaDiffer
};