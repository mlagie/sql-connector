// buildQuery.test.js
const { setGlobalDialect, getDialect } = require('../src/db/dialects');
const { buildSelect, buildQueryParts } = require('../src/utils/buildQuery/buildQuery');

const dialectCases = [
    { name: 'mysql', quote: '`' },
    { name: 'postgres', quote: '"' }
];

function ph(...indices) {
    return indices.map(i => getDialect().getPlaceholder(i));
}

describe.each(dialectCases)('Utils - buildQuery.js - $name', ({ name, quote }) => {
    beforeEach(() => setGlobalDialect(name));

    describe('buildSelect', () => {
        test('Devrait renvoyer "*" si le select est absent ou vide', () => {
            expect(buildSelect()).toBe('*');
            expect(buildSelect([])).toBe('*');
        });

        test("Devrait gérer l'agrégation SUM avec alias optionnel", () => {
            expect(buildSelect([{ sum: 'price' }])).toBe(`SUM(${quote}price${quote}) AS ${quote}price${quote}`);
            expect(buildSelect([{ sum: 'price', as: 'total' }])).toBe(`SUM(${quote}price${quote}) AS ${quote}total${quote}`);
        });

        test("Devrait gérer DATE_FORMAT et appliquer l'échappement sur la colonne", () => {
            const select = [{ dateFormat: ['createdAt', '%Y-%m'], as: 'month' }];
            expect(buildSelect(select)).toBe(`DATE_FORMAT(${quote}createdAt${quote}, '%Y-%m') AS ${quote}month${quote}`);
        });

        test('Devrait gérer une colonne simple déclarée via un objet avec alias', () => {
            expect(buildSelect([{ col: 'role', as: 'user_role' }])).toBe(`${quote}role${quote} AS ${quote}user_role${quote}`);
        });

        test('ILIKE natif pour postgres / fallback LOWER() pour mysql', () => {
            const result = buildQueryParts({ where: { name: { ILIKE: '%john%' } } });
            if (name === 'postgres') {
                expect(result.sql).toBe(`WHERE ${quote}name${quote} ILIKE ${ph(0)}`);
            } else {
                expect(result.sql).toBe(`WHERE LOWER(${quote}name${quote}) LIKE LOWER(${ph(0)})`);
            }
            expect(result.values).toEqual(['%john%']);
        });

        test('NOT ILIKE fallback LOWER() négatif pour mysql / natif pour postgres', () => {
            const result = buildQueryParts({ where: { name: { 'NOT ILIKE': '%John%' } } });
            if (name === 'postgres') {
                expect(result.sql).toBe(`WHERE ${quote}name${quote} NOT ILIKE ${ph(0)}`);
            } else {
                expect(result.sql).toBe(`WHERE NOT LOWER(${quote}name${quote}) LIKE LOWER(${ph(0)})`);
            }
            expect(result.values).toEqual(['%John%']);
        });

        test('BETWEEN', () => {
            const result = buildQueryParts({ where: { age: { BETWEEN: [18, 30] } } });
            expect(result.sql).toBe(`WHERE ${quote}age${quote} BETWEEN ${ph(0)} AND ${ph(1)}`);
            expect(result.values).toEqual([18, 30]);
        });

        test('NOT BETWEEN', () => {
            const result = buildQueryParts({ where: { age: { 'NOT BETWEEN': [18, 30] } } });
            expect(result.sql).toBe(`WHERE ${quote}age${quote} NOT BETWEEN ${ph(0)} AND ${ph(1)}`);
            expect(result.values).toEqual([18, 30]);
        });

        test('NOT structuré', () => {
            const result = buildQueryParts({ where: { NOT: { status: 'banned' } } });
            expect(result.sql).toBe(`WHERE NOT (${quote}status${quote} = ${ph(0)})`);
            expect(result.values).toEqual(['banned']);
        });

        test('NOT invalide lève une erreur', () => {
            expect(() => buildQueryParts({ where: { NOT: 'x' } })).toThrow('NOT condition must be an object');
            expect(() => buildQueryParts({ where: { NOT: ['x'] } })).toThrow('NOT condition must be an object');
            expect(() => buildQueryParts({ where: { NOT: null } })).toThrow('NOT condition must be an object');
        });

        test('NOT sans clause exploitable', () => {
            const result = buildQueryParts({ where: { NOT: {} } });
            expect(result.sql).toBe('WHERE ');
            expect(result.values).toEqual([]);
        });

        test('HAVING sous forme de tableau lève une erreur', () => {
            expect(() => buildQueryParts({ having: [1, 2] })).toThrow(
                'Raw string HAVING clauses are not allowed. Use a structured filter instead.'
            );
        });

        test('OFFSET valide', () => {
            expect(buildQueryParts({ offset: 5 })).toEqual({ sql: `OFFSET ${ph(0)}`, values: [5] });
            expect(buildQueryParts({ offset: 0 })).toEqual({ sql: `OFFSET ${ph(0)}`, values: [0] });
        });

        test('OFFSET invalide', () => {
            expect(() => buildQueryParts({ offset: -1 })).toThrow('Invalid OFFSET value');
            expect(() => buildQueryParts({ offset: 1.5 })).toThrow('Invalid OFFSET value');
            expect(() => buildQueryParts({ offset: 'abc' })).toThrow('Invalid OFFSET value');
        });

        test('LIMIT + OFFSET combinés', () => {
            const result = buildQueryParts({ limit: 10, offset: 20 });
            expect(result.sql).toBe(`LIMIT ${ph(0)}\n\nOFFSET ${ph(1)}`);
            expect(result.values).toEqual([10, 20]);
        });
    });

    describe('buildQueryParts', () => {
        test("Devrait traiter correctement la clause WHERE sous forme d'objet structuré", () => {
            const options = { where: { status: 'active', role: 'admin' } };
            expect(buildQueryParts(options)).toEqual({
                sql: `WHERE ${quote}status${quote} = ${ph(0)} AND ${quote}role${quote} = ${ph(1)}`,
                values: ['active', 'admin']
            });
        });

        test('Devrait lever une erreur si la clause WHERE est passée sous forme de chaîne brute', () => {
            const optionsInvalides = { where: 'WHERE id = 1 OR 1=1' };
            expect(() => buildQueryParts(optionsInvalides)).toThrow(
                'Raw string WHERE clauses are not allowed. Use a structured filter instead.'
            );
        });

        test('Devrait générer la clause GROUP BY et parser correctement DATE_FORMAT', () => {
            const options = { groupBy: ['role', { dateFormat: ['createdAt', '%Y'] }] };
            expect(buildQueryParts(options)).toEqual({
                sql: `GROUP BY ${quote}role${quote}, DATE_FORMAT(${quote}createdAt${quote}, '%Y')`,
                values: []
            });
        });

        test('Devrait lever une erreur si la clause HAVING est passée sous forme de chaîne brute', () => {
            expect(() => buildQueryParts({ having: 'count > 1' })).toThrow(
                'Raw string HAVING clauses are not allowed. Use a structured filter instead.'
            );
        });

        test('Devrait traiter la clause ORDER BY (chaîne simple ou objet structuré)', () => {
            const options = { orderBy: ['name', { field: 'id', direction: 'DESC' }] };
            expect(buildQueryParts(options)).toEqual({
                sql: `ORDER BY ${quote}name${quote}, ${quote}id${quote} DESC`,
                values: []
            });
        });

        test('Devrait accepter la clause LIMIT si elle est un entier valide', () => {
            expect(buildQueryParts({ limit: 10 })).toEqual({ sql: `LIMIT ${ph(0)}`, values: [10] });
            expect(buildQueryParts({ limit: 0 })).toEqual({ sql: '', values: [] });
        });

        test('Devrait lever une erreur si la clause LIMIT est invalide', () => {
            expect(() => buildQueryParts({ limit: -5 })).toThrow('Invalid LIMIT value');
            expect(() => buildQueryParts({ limit: 10.5 })).toThrow('Invalid LIMIT value');
            expect(() => buildQueryParts({ limit: 'abc' })).toThrow('Invalid LIMIT value');
        });

        test('Devrait traiter correctement la clause logique OR imbriquée', () => {
            const options = { where: { OR: [{ status: 'inactive' }, { role: 'guest' }] } };
            const result = buildQueryParts(options);
            expect(result.sql).toBe(`WHERE (${quote}status${quote} = ${ph(0)} OR ${quote}role${quote} = ${ph(1)})`);
            expect(result.values).toEqual(['inactive', 'guest']);
        });

        test('Devrait traiter correctement la clause logique AND imbriquée', () => {
            const options = { where: { AND: [{ status: 'active' }, { is_admin: true }] } };
            const result = buildQueryParts(options);
            expect(result.sql).toBe(`WHERE (${quote}status${quote} = ${ph(0)} AND ${quote}is_admin${quote} = ${ph(1)})`);
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

            expect(result.sql).toContain(`${quote}email${quote} LIKE`);
            expect(result.sql).toContain(`${quote}role${quote} NOT IN (`);
            expect(result.sql).toContain(`${quote}age${quote} >=`);
            expect(result.sql).toContain(`${quote}status${quote} !=`);

            expect(result.values).toContain('%@gmail.com');
            expect(result.values).toContain('admin');
            expect(result.values).toContain(18);
        });
    });

    describe('buildQuery - Advanced Fields & Aggregations', () => {
        test('Should safely compile COUNT(*) aggregated calculations with an expression alias', () => {
            const fields = [{ count: '*', as: 'total_user' }];
            expect(buildSelect(fields)).toBe(`COUNT(*) AS ${quote}total_user${quote}`);
        });

        test('Should safely compile COUNT(column) on structured column identifiers', () => {
            const fields = [{ count: 'id', as: 'unique_ids' }];
            expect(buildSelect(fields)).toBe(`COUNT(${quote}id${quote}) AS ${quote}unique_ids${quote}`);
        });

        test('Should correctly process multi-column GROUP BY arrays to avoid ONLY_FULL_GROUP_BY validation issues', () => {
            const options = {
                select: ['status', 'email', { count: '*', as: 'total_user' }],
                groupBy: ['status', 'email']
            };
            const parts = buildQueryParts(options);

            expect(parts.sql).toContain(`GROUP BY ${quote}status${quote}, ${quote}email${quote}`);
            expect(parts.values).toEqual([]);
        });

        test('COUNT DISTINCT sur plusieurs colonnes', () => {
            expect(
                buildSelect([{ count: ["truc", "bidule"], as: "total" }])
            ).toBe(`COUNT(${quote}truc${quote}) + COUNT(${quote}bidule${quote}) AS ${quote}total${quote}`);
        });

        test('COUNT conditionnel avec NULL', () => {
            expect(
                buildSelect([{ count: { truc: null }, as: "total" }])
            ).toBe(`COUNT(CASE WHEN ${quote}truc${quote} = NULL THEN 1 END) AS ${quote}total${quote}`);
        });

        test('COUNT conditionnel avec NOT NULL', () => {
            const expectedValue = name === 'mysql' ? "'NOT NULL'" : "'NOT NULL'";
            expect(
                buildSelect([{ count: { truc: "NOT NULL" }, as: "total" }])
            ).toBe(`COUNT(CASE WHEN ${quote}truc${quote} = ${expectedValue} THEN 1 END) AS ${quote}total${quote}`);
        });

        test('COUNT refuse un nombre', () => {
            expect(() => buildSelect([{ count: 1515 }])).toThrow(
                "Invalid field type for COUNT. Must be a string, array, or object."
            );
        });

        test('HAVING structuré exécute buildWhere', () => {
            const options = { having: { total: { '>': 5 } } };
            const result = buildQueryParts(options);
            expect(result.sql).toBe(`HAVING ${quote}total${quote} > ${ph(0)}`);
            expect(result.values).toEqual([5]);
        });
    });

    describe('buildQuery - buildGroupByItem', () => {
        test('Return directly an error if group is not a string.', () => {
            const options = {
                select: ['status', 'email', { count: '*', as: 'total_user' }],
                groupBy: ['status', 1255]
            };
            expect(() => buildQueryParts(options)).toThrow("Group by items must be strings");
        });
    });

    test('Devrait gérer DISTINCT avec alias', () => {
        const fields = [{ distinct: 'email', as: 'unique_email' }];
        expect(buildSelect(fields)).toBe(`DISTINCT ${quote}email${quote} AS ${quote}unique_email${quote}`);
    });

    test('count simple', () => {
        expect(buildSelect([{ count: "id" }])).toBe(`COUNT(${quote}id${quote})`);
    });

    test('buildSelect supporte *', () => {
        expect(buildSelect(["*"])).toBe('*');
    });

    test('SUM sans alias génère un alias automatique', () => {
        expect(buildSelect([{ sum: "price" }])).toBe(`SUM(${quote}price${quote}) AS ${quote}price${quote}`);
    });

    test('LIMIT décimal invalide', () => {
        expect(() => buildQueryParts({ limit: 10.5 })).toThrow();
    });

    test('Devrait retourner "*" par défaut si le tableau select est vide', () => {
        expect(buildSelect([])).toEqual('*');
    });

    test('Test avec une condition avec null', () => {
        const result = buildQueryParts({ where: { deleted_at: null } });
        expect(result.sql).toEqual(`WHERE ${quote}deleted_at${quote} IS NULL`);
        expect(result.values).toEqual([]);
    });

    test('Test avec une condition avec null et un operateur =', () => {
        const result = buildQueryParts({ where: { deleted_at: { "=": null } } });
        expect(result.sql).toEqual(`WHERE ${quote}deleted_at${quote} IS NULL`);
        expect(result.values).toEqual([]);
    });

    test('Test avec une condition avec null et un operateur !=', () => {
        const result = buildQueryParts({ where: { deleted_at: { "!=": null } } });
        expect(result.sql).toEqual(`WHERE ${quote}deleted_at${quote} IS NOT NULL`);
        expect(result.values).toEqual([]);
    });

    test("Devrait traiter correctement l'opérateur imbriqué IN", () => {
        const result = buildQueryParts({ where: { id: { IN: [1, 2, 3] } } });
        expect(result.sql).toEqual(`WHERE ${quote}id${quote} IN (${ph(0, 1, 2).join(',')})`);
        expect(result.values).toEqual([1, 2, 3]);
    });

    test('Devrait lever une exception de sécurité si une clause HAVING brute est soumise', () => {
        const options = { where: { status: 'active' }, having: 'COUNT(id) > 5' };
        expect(() => buildQueryParts(options)).toThrow(
            "Raw string HAVING clauses are not allowed. Use a structured filter instead."
        );
    });

    test('Devrait lever une erreur si la clause logique OR est vide', () => {
        expect(() => buildQueryParts({ where: { OR: [] } })).toThrow("OR conditions cannot be empty");
    });

    test('Devrait lever une erreur si la clause logique AND est vide', () => {
        expect(() => buildQueryParts({ where: { AND: [] } })).toThrow("AND conditions cannot be empty");
    });

    test("Devrait traiter un objet classique ne contenant pas d'opérateurs SQL comme une valeur brute", () => {
        const options = { where: { metadata: { nom_famille: 'dupont' } } };
        const result = buildQueryParts(options);
        expect(result.sql).toEqual(`WHERE ${quote}metadata${quote} = ${ph(0)}`);
        expect(result.values).toEqual([{ nom_famille: 'dupont' }]);
    });

    test("Devrait traiter correctement la clause orderBy avec un tableau d'objets structurés", () => {
        const options = { orderBy: [{ field: 'created_at', direction: 'DESC' }, { field: 'username' }] };
        const result = buildQueryParts(options);
        expect(result.sql).toEqual(`ORDER BY ${quote}created_at${quote} DESC, ${quote}username${quote} ASC`);
    });

    test("Devrait compiler un tableau mixte contenant des strings, des objets col, et des objets dateFormat", () => {
        const options = {
            groupBy: ['status', { col: 'role' }, { dateFormat: ['createdAt', '%Y-%m'] }]
        };
        const result = buildQueryParts(options);
        expect(result.sql).toEqual(`GROUP BY ${quote}status${quote}, ${quote}role${quote}, DATE_FORMAT(${quote}createdAt${quote}, '%Y-%m')`);
        expect(result.values).toEqual([]);
    });

    test('GROUP BY supporte un alias', () => {
        const result = buildQueryParts({ groupBy: [{ col: "role", as: "user_role" }] });
        expect(result.sql).toBe(`GROUP BY ${quote}role${quote} AS ${quote}user_role${quote}`);
        expect(result.values).toEqual([]);
    });

    test('WHERE avec valeur undefined', () => {
        const result = buildQueryParts({ where: { deleted_at: undefined } });
        expect(result.sql).toBe(`WHERE ${quote}deleted_at${quote} = ${ph(0)}`);
        expect(result.values).toEqual([undefined]);
    });

    test('OR sans clause exploitable', () => {
        const result = buildQueryParts({ where: { OR: [{}] } });
        expect(result.sql).toBe('WHERE ');
        expect(result.values).toEqual([]);
    });

    test('AND sans clause exploitable', () => {
        const result = buildQueryParts({ where: { AND: [{}] } });
        expect(result.sql).toBe('WHERE ');
        expect(result.values).toEqual([]);
    });

    test('valueOffset décale les placeholders WHERE (cas UPDATE)', () => {
        const result = buildQueryParts({ where: { id: 5 } }, 2);
        expect(result.sql).toBe(`WHERE ${quote}id${quote} = ${getDialect().getPlaceholder(2)}`);
        expect(result.values).toEqual([5]);
    });

    test('valueOffset décale IN', () => {
        const result = buildQueryParts({ where: { id: { IN: [1, 2] } } }, 3);
        expect(result.sql).toBe(`WHERE ${quote}id${quote} IN (${getDialect().getPlaceholder(3)},${getDialect().getPlaceholder(4)})`);
        expect(result.values).toEqual([1, 2]);
    });

    test('valueOffset décale LIMIT/OFFSET', () => {
        const result = buildQueryParts({ limit: 5, offset: 1 }, 1);
        expect(result.sql).toBe(`LIMIT ${getDialect().getPlaceholder(1)}\n\nOFFSET ${getDialect().getPlaceholder(2)}`);
        expect(result.values).toEqual([5, 1]);
    });
});