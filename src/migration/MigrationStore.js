const fs = require("fs/promises");
const path = require("path");
const { encrypt, decrypt } = require("./crypto");
const { parseDuration } = require("./utils");
const { MigrationChecksumError } = require("./errors");

class MigrationStore {
    constructor(options = {}) {
        this.directory = path.resolve(options.directory || "migrations");
        this.backupDirectory = path.resolve(options.backupDirectory || path.join(this.directory, "backups"));
        this.encryptionKey = options.encryptionKey || process.env.SQL_CONNECTOR_MIGRATION_KEY;
        this.retention = parseDuration(options.retention ?? null);
    }

    async ensureDirectories() {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        await fs.mkdir(this.backupDirectory, { recursive: true, mode: 0o700 });
    }

    async writeMigration(plan) {
        await this.ensureDirectories();
        if (!this.encryptionKey) {
            throw new Error("An encryption key is required to write migration files.");
        }
        const outputPath = path.join(this.directory, `${plan.id}.sql.enc`);
        const payload = encrypt(plan.sql, this.encryptionKey);
        await fs.writeFile(outputPath, payload, { encoding: "utf8", mode: 0o600 });

        const metadataPath = path.join(this.directory, `${plan.id}.meta.json.enc`);
        const metadata = {
            version: 1,
            id: plan.id,
            dialect: plan.dialect,
            checksum: plan.checksum,
            operations: plan.operations,
            previousSnapshot: plan.previousSnapshot,
            snapshot: plan.snapshot
        };
        await fs.writeFile(metadataPath, encrypt(JSON.stringify(metadata, null, 2), this.encryptionKey), {
            encoding: "utf8",
            mode: 0o600
        });
        return outputPath;
    }

    async readMigration(id) {
        await this.ensureDirectories();
        if (!this.encryptionKey) throw new Error("An encryption key is required to read migration files.");
        const file = path.join(this.directory, `${id}.meta.json.enc`);
        try {
            return JSON.parse(decrypt(await fs.readFile(file, "utf8"), this.encryptionKey));
        } catch (error) {
            if (error.code === "ENOENT") return null;
            throw error;
        }
    }

    async readBackup(id) {
        await this.ensureDirectories();
        if (!this.encryptionKey) throw new Error("An encryption key is required to read backups.");
        const file = path.join(this.backupDirectory, `${id}.json.enc`);
        try {
            return JSON.parse(decrypt(await fs.readFile(file, "utf8"), this.encryptionKey));
        } catch (error) {
            if (error.code === "ENOENT") return null;
            throw error;
        }
    }

    async writeBackup(name, content) {
        await this.ensureDirectories();
        if (!this.retention) return null;
        if (!this.encryptionKey) {
            throw new Error("An encryption key is required to write backups.");
        }
        const outputPath = path.join(this.backupDirectory, `${name}.json.enc`);
        await fs.writeFile(outputPath, encrypt(JSON.stringify(content, null, 2), this.encryptionKey), {
            encoding: "utf8",
            mode: 0o600
        });
        return outputPath;
    }

    async cleanup(now = Date.now()) {
        if (!this.retention) return 0;
        await this.ensureDirectories();

        const files = await fs.readdir(this.backupDirectory);
        let removed = 0;
        for (const file of files) {
            const fullPath = path.join(this.backupDirectory, file);
            const stat = await fs.stat(fullPath);
            if (now - stat.mtimeMs >= this.retention) {
                await fs.rm(fullPath, { force: true });
                removed++;
            }
        }
        return removed;
    }

    async writeSnapshot(snapshot) {
        await this.ensureDirectories();
        const file = path.join(this.directory, "schema.snapshot.json");
        await fs.writeFile(file, JSON.stringify(snapshot, null, 2) + "\n", {
            encoding: "utf8",
            mode: 0o600
        });
        return file;
    }

    async readSnapshot() {
        try {
            const file = path.join(this.directory, "schema.snapshot.json");
            return JSON.parse(await fs.readFile(file, "utf8"));
        } catch (error) {
            if (error.code === "ENOENT") return null;
            throw error;
        }
    }

    async listMigrationFiles() {
        await this.ensureDirectories();
        return (await fs.readdir(this.directory))
            .filter(file => file.endsWith(".sql.enc"))
            .sort();
    }

    validateChecksum(actual, expected) {
        if (actual !== expected) {
            throw new MigrationChecksumError(
                `Migration checksum mismatch. Expected ${expected}, got ${actual}.`
            );
        }
    }
}

module.exports = { MigrationStore };
