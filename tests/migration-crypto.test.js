const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const {
    encrypt,
    decrypt,
    encryptFile,
    decryptFile,
    FORMAT
} = require("../src/migration/crypto");

describe("migration crypto", () => {
    test("encrypt/decrypt round trip", () => {
        const secret = "test-secret";
        const input = "ALTER TABLE `users` ADD COLUMN `x` INT;";

        const encrypted = encrypt(input, secret);

        expect(encrypted).not.toBe(input);
        expect(decrypt(encrypted, secret)).toBe(input);
    });

    test("rejects an incorrect encryption key", () => {
        const encrypted = encrypt("secret migration", "correct-secret");

        expect(() => decrypt(encrypted, "wrong-secret")).toThrow();
    });

    test("rejects missing or non-string secret on encrypt", () => {
        expect(() => encrypt("data", undefined)).toThrow(
            "Migration encryption key is missing. Provide encryption.key or SQL_CONNECTOR_MIGRATION_KEY."
        );
        expect(() => encrypt("data", 12345)).toThrow(
            "Migration encryption key is missing. Provide encryption.key or SQL_CONNECTOR_MIGRATION_KEY."
        );
    });

    test("rejects an unsupported payload format", () => {
        expect(() => decrypt("not-the-right-format\nfoo=bar\n", "secret")).toThrow(
            "Unsupported encrypted migration format."
        );
    });

    test("rejects a payload with invalid component lengths", () => {
        const badPayload = [
            FORMAT,
            "salt=YQ",
            "iv=YQ",
            "tag=YQ",
            "data=YQ"
        ].join("\n") + "\n";

        expect(() => decrypt(badPayload, "secret")).toThrow("Invalid encrypted migration payload.");
    });

    test("encryptFile/decryptFile round trip using the filesystem", async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "migration-crypto-"));
        const inputPath = path.join(dir, "plain.sql");
        const outputPath = path.join(dir, "plain.sql.enc");
        const content = "CREATE TABLE t (id INT);";
        const secret = "file-secret";

        await fs.writeFile(inputPath, content, "utf8");
        await encryptFile(inputPath, outputPath, secret);

        const decrypted = await decryptFile(outputPath, secret);
        expect(decrypted).toBe(content);

        await fs.rm(dir, { recursive: true, force: true });
    });
});
