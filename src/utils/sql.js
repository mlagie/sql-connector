function escapeOrderDirection(direction) {
    const normalized = String(direction ?? "ASC").toUpperCase();

    if (normalized !== "ASC" && normalized !== "DESC") {
        throw new Error(`Invalid SQL sort direction: ${direction}`);
    }

    return normalized;
}

module.exports = {
    escapeOrderDirection
};