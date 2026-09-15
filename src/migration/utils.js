const crypto = require("crypto");

function assertIdentifier(value, label = "identifier") {
    if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
        throw new Error(`Invalid ${label}: ${value}`);
    }
    return value;
}

function quoteIdentifier(name, quote) {
    assertIdentifier(name);
    return `${quote}${name}${quote}`;
}

function normalizeType(field) {
    const type = field && field.type;
    if (typeof type === "function") return type.name;
    if (type && typeof type === "object" && typeof type.name === "string") return type.name;
    if (typeof type === "string") return type;
    return undefined;
}

function normalizeDefault(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return value;
    return String(value);
}

function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function migrationId(name = "migration") {
    const now = new Date();
    const stamp = now.toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 14);
    const safeName = String(name)
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80) || "migration";
    return `${stamp}_${safeName}`;
}

function parseDuration(value) {
    if (value === null || value === false || value === undefined) return null;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;

    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/i.exec(String(value).trim());
    if (!match) throw new Error(`Invalid retention duration: ${value}`);

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const factors = {
        ms: 1,
        s: 1000,
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000,
        w: 604_800_000
    };
    return amount * factors[unit];
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

module.exports = {
    assertIdentifier,
    quoteIdentifier,
    normalizeType,
    normalizeDefault,
    stableStringify,
    sha256,
    migrationId,
    parseDuration,
    clone
};
