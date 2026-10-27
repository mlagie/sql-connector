const { MigrationStore } = require("../src/migration/MigrationStore");

describe("MigrationStore identifier validation", () => {
    const store = new MigrationStore();

    test.each(["../outside", "sub/path", "..", "", "contains.dot"]) (
        "rejects unsafe file identifier %s",
        id => expect(() => store.validateId(id)).toThrow("Invalid migration or backup identifier.")
    );

    test("accepts generated timestamp and slug identifiers", () => {
        expect(() => store.validateId("20261026091530_create_schema-v2")).not.toThrow();
    });
});
