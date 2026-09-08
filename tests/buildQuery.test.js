const { buildSelect, buildQueryParts } = require('../src/utils/buildQuery/buildQuery');

describe('Utils - buildQuery.js', () => {
    describe('buildSelect', () => {
        test('Devrait renvoyer "*" si le select est absent ou vide', () => {
            expect(buildSelect()).toBe('*');
            expect(buildSelect([])).toBe('*');
        });

        test('Devrait gérer l\'agrégation SUM avec alias optionnel', () => {
            expect(buildSelect([{ sum: 'price' }])).toBe('SUM(`price`) AS `price`');
            expect(buildSelect([{ sum: 'price', as: 'total' }])).toBe('SUM(`price`) AS `total`');
        });
        test('Devrait gérer DATE_FORMAT et appliquer l\'échappement sur la colonne', () => {
            const select = [{ dateFormat: ['createdAt', '%Y-%m'], as: 'month' }];
            expect(buildSelect(select)).toBe("DATE_FORMAT(`createdAt`, '%Y-%m') AS `month`");
        });

        test('Devrait gérer une colonne simple déclarée via un objet avec alias', () => {
            expect(buildSelect([{ col: 'role', as: 'user_role' }])).toBe('`role` AS `user_role`');
        });
    });

    describe('buildQueryParts', () => {

        test('Devrait traiter correctement la clause WHERE sous forme d\'objet structuré (Cas nominal sécurisé)', () => {
            const options = { where: { status: 'active', role: 'admin' } };

            // L'objet est nettoyé et les colonnes sont échappées avec des backticks
            expect(buildQueryParts(options)).toEqual({ "sql": "WHERE `status` = ? AND `role` = ?", "values": ["active", "admin"] });
        });

        test('Devrait lever une erreur si la clause WHERE est passée sous forme de chaîne brute (Protection Injection SQL)', () => {
            const optionsInvalides = { where: 'WHERE id = 1 OR 1=1' };

            expect(() => buildQueryParts(optionsInvalides)).toThrow(
                'Raw string WHERE clauses are not allowed. Use a structured filter instead.'
            );
        });

        test('Devrait générer la clause GROUP BY et parser correctement DATE_FORMAT', () => {
            const options = { groupBy: ['role', { dateFormat: ['createdAt', '%Y'] }] };
            expect(buildQueryParts(options)).toEqual({ "sql": "GROUP BY `role`, DATE_FORMAT(`createdAt`, '%Y')", "values": [] });
        });

        test('Devrait lever une erreur si la clause HAVING est passée sous forme de chaîne brute', () => {
            expect(() => buildQueryParts({ having: 'count > 1' })).toThrow(
                'Raw string HAVING clauses are not allowed. Use a structured filter instead.'
            );
        });

        test('Devrait traiter la clause ORDER BY (chaîne simple ou objet structuré)', () => {
            const options = {
                orderBy: ['name', { field: 'id', direction: 'DESC' }]
            };
            expect(buildQueryParts(options)).toEqual({ "sql": "ORDER BY `name`, `id` DESC", "values": [] });
        });

        test('Devrait accepter la clause LIMIT si elle est un entier valide', () => {
            expect(buildQueryParts({ limit: 10 })).toEqual({ "sql": "LIMIT ?", "values": [10] });
            expect(buildQueryParts({ limit: 0 })).toEqual({ "sql": "", "values": [] });
        });

        test('Devrait lever une erreur si la clause LIMIT est invalide', () => {
            expect(() => buildQueryParts({ limit: -5 })).toThrow('Invalid LIMIT value');
            expect(() => buildQueryParts({ limit: 10.5 })).toThrow('Invalid LIMIT value');
            expect(() => buildQueryParts({ limit: 'abc' })).toThrow('Invalid LIMIT value');
        });

        test('Devrait traiter correctement la clause logique OR imbriquée', () => {
            const options = {
                where: {
                    OR: [
                        { status: 'inactive' },
                        { role: 'guest' }
                    ]
                }
            };
            const result = buildQueryParts(options);
            expect(result.sql).toEqual("WHERE (`status` = ? OR `role` = ?)");
            expect(result.values).toEqual(['inactive', 'guest']);
        });

        test('Devrait traiter correctement la clause logique AND imbriquée', () => {
            const options = {
                where: {
                    AND: [
                        { status: 'active' },
                        { is_admin: true }
                    ]
                }
            };
            const result = buildQueryParts(options);
            expect(result.sql).toEqual("WHERE (`status` = ? AND `is_admin` = ?)");
            expect(result.values).toEqual(['active', true]);
        });

        test('Devrait traiter les opérateurs de comparaison (LIKE, NOT IN, >=, !=)', () => {
            const options = {
                where: {
                    email: { LIKE: '%@gmail.com' },
                    role: { 'NOT IN': ['admin', 'moderator'] },
                    age: { '>=': 18 },
                    status: { '!=': 'deleted' }
                }
            };
            const result = buildQueryParts(options);

            expect(result.sql).toContain("`email` LIKE ?");
            expect(result.sql).toContain("`role` NOT IN (?,?)");
            expect(result.sql).toContain("`age` >= ?");
            expect(result.sql).toContain("`status` != ?");

            expect(result.values).toContain('%@gmail.com');
            expect(result.values).toContain('admin');
            expect(result.values).toContain(18);
        });

    });
    describe('buildQuery - Advanced Fields & Aggregations', () => {

        test('Should safely compile COUNT(*) aggregated calculations with an expression alias', () => {
            const fields = [{ count: '*', as: 'total_user' }];
            expect(buildSelect(fields)).toBe('COUNT(*) AS `total_user`');
        });

        test('Should safely compile COUNT(column) on structured column identifiers', () => {
            const fields = [{ count: 'id', as: 'unique_ids' }];
            expect(buildSelect(fields)).toBe('COUNT(`id`) AS `unique_ids`');
        });

        test('Should correctly process multi-column GROUP BY arrays to avoid ONLY_FULL_GROUP_BY validation issues', () => {
            const options = {
                select: ['status', 'email', { count: '*', as: 'total_user' }],
                groupBy: ['status', 'email']
            };
            const parts = buildQueryParts(options);

            expect(parts.sql).toContain('GROUP BY `status`, `email`');
            expect(parts.values).toEqual([]);
        });

        test("COUNT DISTINCT sur plusieurs colonnes", () => {
            expect(
                buildSelect([
                    {
                        count: ["truc", "bidule"],
                        as: "total"
                    }
                ])
            ).toBe("COUNT(`truc`) + COUNT(`bidule`) AS `total`");
        });

        test("COUNT conditionnel avec NULL", () => {
            expect(
                buildSelect([
                    {
                        count: {
                            truc: null
                        },
                        as: "total"
                    }
                ])
            ).toBe("COUNT(CASE WHEN `truc` = NULL THEN 1 END) AS `total`");
        });

        test("COUNT conditionnel avec NOT NULL", () => {
            expect(
                buildSelect([
                    {
                        count: {
                            truc: "NOT NULL"
                        },
                        as: "total"
                    }
                ])
            ).toBe("COUNT(CASE WHEN `truc` = 'NOT NULL' THEN 1 END) AS `total`");
        });

        test("COUNT refuse un nombre", () => {
            expect(() =>
                buildSelect([
                    {
                        count: 1515
                    }
                ])
            ).toThrow(
                "Invalid field type for COUNT. Must be a string, array, or object."
            );
        });

    });

    describe("buildQuery - buildGroupByItem", () => {
        test('Return directly an error if group is not a string.', () => {
            const options = {
                select: ['status', 'email', { count: '*', as: 'total_user' }],
                groupBy: ['status', 1255]
            };

            expect(() => buildQueryParts(options)).toThrow(
                "Group by items must be strings"
            );
        })
    })

    test('Devrait gérer DISTINCT avec alias', () => {
        const fields = [
            {
                distinct: 'email',
                as: 'unique_email'
            }
        ];

        expect(buildSelect(fields))
            .toBe('DISTINCT `email` AS `unique_email`');
    });

    test("count simple", () => {
        expect(
            buildSelect([
                { count: "id" }
            ])
        ).toBe("COUNT(`id`)");
    });


    test("buildSelect supporte *", () => {
        expect(
            buildSelect(["*"])
        ).toBe("*");
    });

    test("SUM sans alias génère un alias automatique", () => {
        expect(
            buildSelect([
                {
                    sum: "price"
                }
            ])
        ).toBe("SUM(`price`) AS `price`");
    });

    test("LIMIT décimal invalide", () => {
        expect(() =>
            buildQueryParts({
                limit: 10.5
            })
        ).toThrow();
    });

    test('Devrait retourner "*" par défaut si le tableau select est vide', () => {
        const result = buildSelect([]);
        expect(result).toEqual('*');
    });

    test('Test avec une condition avec null', () => {
        const options = {
            where: {
                deleted_at: null
            }
        };
        const result = buildQueryParts(options);
        expect(result.sql).toEqual('WHERE `deleted_at` IS NULL');
        expect(result.values).toEqual([]);
    })

    test('Test avec une condition avec null et un operateur =', () => {
        const options = {
            where: {
                deleted_at: { "=": null }
            }
        };
        const result = buildQueryParts(options);
        expect(result.sql).toEqual('WHERE `deleted_at` IS NULL');
        expect(result.values).toEqual([]);
    })

    test('Test avec une condition avec null et un operateur !=', () => {
        const options = {
            where: {
                deleted_at: { "!=": null }
            }
        };
        const result = buildQueryParts(options);
        expect(result.sql).toEqual('WHERE `deleted_at` IS NOT NULL');
        expect(result.values).toEqual([]);
    })

    test('Devrait traiter correctement l\'opérateur imbriqué IN', () => {
        const options = {
            where: {
                id: { IN: [1, 2, 3] }
            }
        };
        const result = buildQueryParts(options);
        expect(result.sql).toEqual('WHERE `id` IN (?,?,?)');
        expect(result.values).toEqual([1, 2, 3]);
    });

    test('Devrait lever une exception de sécurité si une clause HAVING brute est soumise', () => {
        const options = {
            where: { status: 'active' },
            having: 'COUNT(id) > 5'
        };

        expect(() => {
            buildQueryParts(options);
        }).toThrow("Raw string HAVING clauses are not allowed. Use a structured filter instead.");
    });

    test('Devrait lever une erreur si la clause logique OR est vide', () => {
        const options = {
            where: { OR: [] }
        };
        expect(() => {
            buildQueryParts(options);
        }).toThrow("OR conditions cannot be empty");
    });

    test('Devrait lever une erreur si la clause logique AND est vide', () => {
        const options = {
            where: { AND: [] }
        };
        expect(() => {
            buildQueryParts(options);
        }).toThrow("AND conditions cannot be empty");
    });

    test('Devrait traiter un objet classique ne contenant pas d\'opérateurs SQL comme une valeur brute', () => {
        const options = {
            where: {
                metadata: { nom_famille: 'dupont' }
            }
        };
        const result = buildQueryParts(options);

        expect(result.sql).toEqual('WHERE `metadata` = ?');
        expect(result.values).toEqual([{ nom_famille: 'dupont' }]);
    });

    test('Devrait traiter correctement la clause orderBy avec un tableau d\'objets structurés', () => {
        const options = {
            orderBy: [
                { field: 'created_at', direction: 'DESC' },
                { field: 'username' }
            ]
        };
        const result = buildQueryParts(options);
        expect(result.sql).toEqual('ORDER BY `created_at` DESC, `username` ASC');
    });

    test('Devrait compiler un tableau mixte contenant des strings, des objets col, et des objets dateFormat', () => {
        const options = {
            groupBy: [
                'status',
                { col: 'role' },
                { dateFormat: ['createdAt', '%Y-%m'] }
            ]
        };

        const result = buildQueryParts(options);

        expect(result.sql).toEqual("GROUP BY `status`, `role`, DATE_FORMAT(`createdAt`, '%Y-%m')");
        expect(result.values).toEqual([]);
    });

    test("GROUP BY supporte un alias", () => {
        const result = buildQueryParts({
            groupBy: [
                {
                    col: "role",
                    as: "user_role"
                }
            ]
        });

        expect(result.sql)
            .toBe("GROUP BY `role` AS `user_role`");

        expect(result.values)
            .toEqual([]);
    });

    test("WHERE avec valeur undefined", () => {
        const result = buildQueryParts({
            where: {
                deleted_at: undefined
            }
        });

        expect(result.sql).toBe("WHERE `deleted_at` = ?");
        expect(result.values).toEqual([undefined]);
    });

    test("OR sans clause exploitable", () => {
        const result = buildQueryParts({
            where: {
                OR: [{}]
            }
        });

        expect(result.sql).toBe("WHERE ");
        expect(result.values).toEqual([]);
    });

    test("AND sans clause exploitable", () => {
        const result = buildQueryParts({
            where: {
                AND: [{}]
            }
        });

        expect(result.sql).toBe("WHERE ");
        expect(result.values).toEqual([]);
    });
});
