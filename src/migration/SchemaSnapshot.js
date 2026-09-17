const { clone, normalizeType, normalizeDefault, stableStringify, sha256 } = require("./utils");

function fieldToSnapshot(field) {
    return {
        type: normalizeType(field),
        length: field.length ?? null,
        required: Boolean(field.required),
        default: normalizeDefault(field.default),
        unique: Boolean(field.unique),
        auto_increment: Boolean(field.auto_increment),
        foreignKey: field.foreignKey ?? null,
        enum: Array.isArray(field.enum) ? [...field.enum] : null,
        primary_key: Boolean(field.primary_key),
        customize: field.customize ?? null,
        oldname: field.oldname ?? null
    };
}

function modelsToSnapshot(models) {
    const tables = {};

    for (const model of models) {
        if (!model || typeof model.name !== "string" || !model.schema?.schemaDict) {
            throw new Error("Migration received an invalid Model.");
        }

        tables[model.name] = {
            columns: Object.fromEntries(
                Object.entries(model.schema.schemaDict).map(([name, field]) => [name, fieldToSnapshot(field)])
            )
        };
    }

    return {
        version: 1,
        tables
    };
}

function snapshotChecksum(snapshot) {
    return sha256(stableStringify(snapshot));
}

function cloneSnapshot(snapshot) {
    return clone(snapshot);
}

module.exports = {
    fieldToSnapshot,
    modelsToSnapshot,
    snapshotChecksum,
    cloneSnapshot
};
