class MigrationError extends Error {
    constructor(message, code = "MIGRATION_ERROR", details = undefined) {
        super(message);
        this.name = "MigrationError";
        this.code = code;
        this.details = details;
    }
}

class DestructiveMigrationError extends MigrationError {
    constructor(message, details) {
        super(message, "DESTRUCTIVE_MIGRATION", details);
        this.name = "DestructiveMigrationError";
    }
}

class MigrationChecksumError extends MigrationError {
    constructor(message, details) {
        super(message, "MIGRATION_CHECKSUM_MISMATCH", details);
        this.name = "MigrationChecksumError";
    }
}

module.exports = {
    MigrationError,
    DestructiveMigrationError,
    MigrationChecksumError
};
