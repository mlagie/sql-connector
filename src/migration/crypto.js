const crypto = require("crypto");
const fs = require("fs/promises");

const FORMAT = "sql-connector-migration-v1";
const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey(secret, salt) {
    if (!secret || typeof secret !== "string") {
        throw new Error(
            "Migration encryption key is missing. Provide encryption.key or SQL_CONNECTOR_MIGRATION_KEY."
        );
    }

    return crypto.scryptSync(secret, salt, KEY_LENGTH);
}

function encrypt(text, secret) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(secret, salt);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
        FORMAT,
        `salt=${salt.toString("base64url")}`,
        `iv=${iv.toString("base64url")}`,
        `tag=${tag.toString("base64url")}`,
        `data=${ciphertext.toString("base64url")}`
    ].join("\n") + "\n";
}

function decrypt(payload, secret) {
    const lines = String(payload).trim().split("\n");
    if (lines[0] !== FORMAT) throw new Error("Unsupported encrypted migration format.");

    const values = Object.fromEntries(lines.slice(1).map(line => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
    }));

    const salt = Buffer.from(values.salt, "base64url");
    const iv = Buffer.from(values.iv, "base64url");
    const tag = Buffer.from(values.tag, "base64url");
    const ciphertext = Buffer.from(values.data, "base64url");

    if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
        throw new Error("Invalid encrypted migration payload.");
    }

    const key = deriveKey(secret, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function encryptFile(inputPath, outputPath, secret) {
    const content = await fs.readFile(inputPath, "utf8");
    await fs.writeFile(outputPath, encrypt(content, secret), { mode: 0o600 });
}

async function decryptFile(inputPath, secret) {
    return decrypt(await fs.readFile(inputPath, "utf8"), secret);
}

module.exports = {
    FORMAT,
    encrypt,
    decrypt,
    encryptFile,
    decryptFile
};
