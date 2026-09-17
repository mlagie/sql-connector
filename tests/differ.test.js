const {
    SchemaDiffer
} = require("../src/migration/SchemaDiffer");
const { DestructiveMigrationError } = require("../src/migration/errors");

describe("SchemaDiffer", () => {
    test("renames a column using oldname", () => {
        const desired = {
            version: 1,
            tables: {
                users: {
                    columns: {
                        email_address: {
                            type: "String",
                            length: 255,
                            required: true,
                            oldname: "email"
                        }
                    }
                }
            }
        };

        const current = {
            version: 1,
            tables: {
                users: {
                    columns: {
                        email: {
                            type: "varchar",
                            length: 255,
                            required: true
                        }
                    }
                }
            }
        };

        const operations = new SchemaDiffer().diff(desired, current);

        expect(operations).toHaveLength(1);
        expect(operations[0]).toEqual(
            expect.objectContaining({
                type: "renameColumn",
                table: "users",
                oldName: "email",
                newName: "email_address"
            })
        );
    });

    test("requires explicit approval for destructive schema changes (dropColumn)", () => {
        const desired = { version: 1, tables: { users: { columns: {} } } };
        const current = {
            version: 1,
            tables: { users: { columns: { email: { type: "varchar", length: 255 } } } }
        };

        expect(() => new SchemaDiffer().diff(desired, current)).toThrow(/allowDestructiveChanges/);
    });

    test("creates a table when it does not exist yet", () => {
        const desired = {
            version: 1,
            tables: { users: { columns: { id: { type: "Number" } } } }
        };
        const current = { version: 1, tables: {} };

        const operations = new SchemaDiffer().diff(desired, current);

        expect(operations).toEqual([
            { type: "createTable", table: "users", schema: { id: { type: "Number" } } }
        ]);
    });

    test("adds a new column when it does not exist on current table", () => {
        const desired = {
            version: 1,
            tables: { users: { columns: { name: { type: "String" }, age: { type: "Number" } } } }
        };
        const current = {
            version: 1,
            tables: { users: { columns: { name: { type: "varchar" } } } }
        };

        const operations = new SchemaDiffer().diff(desired, current);

        expect(operations).toEqual([
            { type: "addColumn", table: "users", column: "age", field: { type: "Number" } }
        ]);
    });

    test("alters a column when its definition changed", () => {
        const desired = {
            version: 1,
            tables: { users: { columns: { name: { type: "String", length: 512 } } } }
        };
        const current = {
            version: 1,
            tables: { users: { columns: { name: { type: "varchar", length: 255 } } } }
        };

        const operations = new SchemaDiffer().diff(desired, current);

        expect(operations).toEqual([
            {
                type: "alterColumn",
                table: "users",
                column: "name",
                field: { type: "String", length: 512 },
                previous: { type: "varchar", length: 255 }
            }
        ]);
    });

    test("does not alter a column when the definition is equivalent", () => {
        const desired = {
            version: 1,
            tables: { users: { columns: { name: { type: "String", length: 255 } } } }
        };
        const current = {
            version: 1,
            tables: { users: { columns: { name: { type: "varchar", length: 255 } } } }
        };

        expect(new SchemaDiffer().diff(desired, current)).toEqual([]);
    });

    test("drops a column when allowDestructiveChanges is true", () => {
        const desired = { version: 1, tables: { users: { columns: {} } } };
        const current = {
            version: 1,
            tables: { users: { columns: { email: { type: "varchar" } } } }
        };

        const operations = new SchemaDiffer({ allowDestructiveChanges: true }).diff(desired, current);

        expect(operations).toEqual([
            { type: "dropColumn", table: "users", column: "email", destructive: true }
        ]);
    });

    test("drops a table when allowDropTables is true", () => {
        const desired = { version: 1, tables: {} };
        const current = { version: 1, tables: { legacy: { columns: {} } } };

        const operations = new SchemaDiffer({ allowDropTables: true }).diff(desired, current);

        expect(operations).toEqual([
            { type: "dropTable", table: "legacy", destructive: true }
        ]);
    });

    test("requires explicit approval for dropping a table", () => {
        const desired = { version: 1, tables: {} };
        const current = { version: 1, tables: { legacy: { columns: {} } } };

        expect(() => new SchemaDiffer().diff(desired, current)).toThrow(DestructiveMigrationError);
        expect(() => new SchemaDiffer().diff(desired, current)).toThrow(/allowDropTables/);
    });

    test("rejects oldname equal to the new column name", () => {
        const desired = {
            version: 1,
            tables: { users: { columns: { email: { type: "String", oldname: "email" } } } }
        };
        const current = { version: 1, tables: { users: { columns: { email: { type: "varchar" } } } } };

        expect(() => new SchemaDiffer().diff(desired, current)).toThrow(
            "Column 'email' cannot have oldname equal to itself."
        );
    });

    test("rejects oldname referencing a column that does not exist", () => {
        const desired = {
            version: 1,
            tables: { users: { columns: { email_address: { type: "String", oldname: "missing" } } } }
        };
        const current = { version: 1, tables: { users: { columns: { email: { type: "varchar" } } } } };

        expect(() => new SchemaDiffer().diff(desired, current)).toThrow(
            "Column 'missing' specified by oldname for 'users.email_address' does not exist."
        );
    });

    test("rejects rename when target column name already exists", () => {
        const desired = {
            version: 1,
            tables: {
                users: {
                    columns: {
                        email: { type: "String" },
                        contact: { type: "String", oldname: "email" }
                    }
                }
            }
        };
        const current = {
            version: 1,
            tables: {
                users: {
                    columns: {
                        email: { type: "varchar" },
                        contact: { type: "varchar" }
                    }
                }
            }
        };

        expect(() => new SchemaDiffer().diff(desired, current)).toThrow(
            "Cannot rename 'users.email' to 'contact' because 'contact' already exists."
        );
    });

    test("rejects multiple renames from the same old column", () => {
        const desired = {
            version: 1,
            tables: {
                users: {
                    columns: {
                        first_alias: { type: "String", oldname: "legacy" },
                        second_alias: { type: "String", oldname: "legacy" }
                    }
                }
            }
        };
        const current = {
            version: 1,
            tables: { users: { columns: { legacy: { type: "varchar" } } } }
        };

        expect(() => new SchemaDiffer().diff(desired, current)).toThrow(
            "Column 'users.legacy' is used by multiple oldname declarations."
        );
    });

    test("excludes renamed-from columns from dropColumn detection", () => {
        const desired = {
            version: 1,
            tables: {
                users: {
                    columns: { email_address: { type: "String", oldname: "email" } }
                }
            }
        };
        const current = {
            version: 1,
            tables: { users: { columns: { email: { type: "varchar" } } } }
        };

        const operations = new SchemaDiffer({ allowDestructiveChanges: true }).diff(desired, current);

        expect(operations).toEqual([
            { type: "renameColumn", table: "users", oldName: "email", newName: "email_address" }
        ]);
    });

    test("normalizes field type aliases as equivalent (integer/int, boolean/bool, float/double)", () => {
        const desired = {
            version: 1,
            tables: {
                t: {
                    columns: {
                        a: { type: "int" },
                        b: { type: "bool" },
                        c: { type: "double" },
                        d: { type: "int8" },
                        e: { type: "character varying" }
                    }
                }
            }
        };
        const current = {
            version: 1,
            tables: {
                t: {
                    columns: {
                        a: { type: "integer" },
                        b: { type: "boolean" },
                        c: { type: "float" },
                        d: { type: "bigint" },
                        e: { type: "varchar" }
                    }
                }
            }
        };

        expect(new SchemaDiffer().diff(desired, current)).toEqual([]);
    });

    test("falls back to raw type string for unknown aliases", () => {
        const desired = { version: 1, tables: { t: { columns: { a: { type: "customtype" } } } } };
        const current = { version: 1, tables: { t: { columns: { a: { type: "customtype" } } } } };

        expect(new SchemaDiffer().diff(desired, current)).toEqual([]);
    });

    test("handles missing tables map on desired/current gracefully", () => {
        expect(new SchemaDiffer().diff({}, {})).toEqual([]);
    });

    test("defaults desired table columns to an empty map when absent (createTable)", () => {
        const desired = { version: 1, tables: { users: {} } };
        const current = { version: 1, tables: {} };

        expect(new SchemaDiffer().diff(desired, current)).toEqual([
            { type: "createTable", table: "users", schema: {} }
        ]);
    });

    test("defaults current table columns to an empty map when absent", () => {
        const desired = {
            version: 1,
            tables: { users: { columns: { name: { type: "String" } } } }
        };
        const current = { version: 1, tables: { users: {} } };

        expect(new SchemaDiffer().diff(desired, current)).toEqual([
            { type: "addColumn", table: "users", column: "name", field: { type: "String" } }
        ]);
    });

    test("treats fields without an explicit type as equivalent (normalizeType nullish branch)", () => {
        const desired = { version: 1, tables: { t: { columns: { a: {} } } } };
        const current = { version: 1, tables: { t: { columns: { a: {} } } } };

        expect(new SchemaDiffer().diff(desired, current)).toEqual([]);
    });
});