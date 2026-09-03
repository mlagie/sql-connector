const { getDialect, setGlobalDialect } = require('../src/db/dialects');
const { escapeOrderDirection } = require('../src/utils/sql');
const { mockExecute, mockPool, mockPgPool } = require('./mysqlMock');

describe('Utils - sql.js (Multi-Dialect)', () => {

    // Boucle automatique sur les deux dialectes pris en charge
    describe.each([
        { dialect: 'mysql', startChar: '`', endChar: '`' },
        { dialect: 'postgres', startChar: '"', endChar: '"' }
    ])('Tests pour le dialecte: $dialect', ({ dialect, startChar, endChar }) => {

        beforeEach(() => {
            setGlobalDialect(dialect);
        });

        describe('escape', () => {
            test('Devrait renvoyer "*" inchangé', () => {
                expect(getDialect().escape('*')).toBe('*');
            });

            test(`Devrait formater un identifiant simple avec l'enveloppe correcte`, () => {
                expect(getDialect().escape('users')).toBe(`${startChar}users${endChar}`);
            });

            test('Devrait gérer les identifiants composites sépares par un point', () => {
                expect(getDialect().escape('users.id')).toBe(`${startChar}users${endChar}.${startChar}id${endChar}`);
                expect(getDialect().escape('users.*')).toBe(`${startChar}users${endChar}.*`);
            });

            test("Devrait lever une erreur si l'identifiant n'est pas une chaîne de caractères ou vide", () => {
                expect(() => getDialect().escape('')).toThrow('Invalid SQL identifier');
                expect(() => getDialect().escape(null)).toThrow('Invalid SQL identifier');
            });

            test("Devrait lever une erreur en cas de tentative d'injection de caractères non autorisés", () => {
                expect(() => getDialect().escape('users; DROP TABLE users;')).toThrow('Invalid SQL identifier');
                expect(() => getDialect().escape('users-table')).toThrow('Invalid SQL identifier');
                expect(() => getDialect().escape('users.id;--')).toThrow('Invalid SQL identifier');
            });
        });

        describe('escapeValue', () => {
            test("Devrait déléguer l'échappement de valeurs de manière sécurisée", () => {
                if (dialect === 'mysql') {
                    expect(getDialect().escapeValue("John's")).toBe("'John\\'s'");
                } else {
                    expect(getDialect().escapeValue("John's")).toBe("'John''s'");
                }
                expect(getDialect().escapeValue(42)).toBe('42');
            });
        });
    });

    // Cette fonction reste globale et standard ANSI
    describe('escapeOrderDirection', () => {
        test('Devrait normaliser en majuscule ASC et DESC', () => {
            expect(escapeOrderDirection('asc')).toBe('ASC');
            expect(escapeOrderDirection('DESC')).toBe('DESC');
        });

        test('Devrait retourner ASC par défaut si null ou undefined', () => {
            expect(escapeOrderDirection(null)).toBe('ASC');
            expect(escapeOrderDirection(undefined)).toBe('ASC');
        });

        test('Devrait lever une erreur pour toute direction invalide', () => {
            expect(() => escapeOrderDirection('INJECTION;')).toThrow('Invalid SQL sort direction');
        });
    });
});

describe('Database dialects', () => {
    beforeEach(() => {
        mockExecute.mockReset();
        mockPgPool.query.mockReset();
    });

    test('MySQL exécute une requête et extrait les résultats du driver', async () => {
        setGlobalDialect('mysql');
        mockExecute.mockResolvedValueOnce([[{ id: 1 }], []]);

        await expect(getDialect().execute(mockPool, 'SELECT 1', [1])).resolves.toEqual([{ id: 1 }]);
        expect(mockExecute).toHaveBeenCalledWith('SELECT 1', [1]);
        expect(getDialect().getPlaceholder(0)).toBe('?');
        expect(getDialect().extractUuid([{ 'UUID()': 'mysql-uuid' }])).toBe('mysql-uuid');
        expect(getDialect().extractUuid({ 'UUID()': 'fallback-uuid' })).toBe('fallback-uuid');
        expect(getDialect().countKey({ 'COUNT(*)': 4 })).toBe(4);
        expect(getDialect().countKey({ count: 5 })).toBe(5);
        expect(getDialect().getAffectedRows({ affectedRows: 2 })).toBe(2);
        expect(getDialect().getAffectedRows({})).toBe(0);
        expect(getDialect().getAffectedRows(null)).toBe(0);
    });

    test('PostgreSQL convertit les placeholders et conserve rowCount', async () => {
        setGlobalDialect('postgres');
        mockPgPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

        const rows = await getDialect().execute(mockPgPool, 'SELECT * FROM users WHERE id = ? AND active = ?', [1, true]);
        expect([...rows]).toEqual([{ id: 1 }]);
        expect(rows.rowCount).toBe(1);
        expect(mockPgPool.query).toHaveBeenCalledWith(
            'SELECT * FROM users WHERE id = $1 AND active = $2',
            [1, true]
        );
        expect(getDialect().extractUuid([{ uuid: 'postgres-uuid' }])).toBe('postgres-uuid');
        expect(getDialect().extractUuid({ uuid: 'fallback-uuid' })).toBe('fallback-uuid');
        expect(getDialect().getPlaceholder(0)).toBe('$1');
        expect(getDialect().getPlaceholder(2)).toBe('$3');
        expect(getDialect().escapeIdentifierList(['users', 'id'])).toBe('users, id');
        expect(getDialect().countKey({ count: 6 })).toBe(6);
        expect(getDialect().countKey({ total: 7 })).toBe(7);
        expect(getDialect().getAffectedRows(rows)).toBe(1);
        expect(getDialect().getAffectedRows([])).toBe(0);
    });

    test('PostgreSQL conserve une requête sans placeholder et gère les valeurs SQL', async () => {
        setGlobalDialect('postgres');
        mockPgPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        await expect(getDialect().execute(mockPgPool, 'SELECT 1')).resolves.toHaveLength(0);
        expect(mockPgPool.query).toHaveBeenCalledWith('SELECT 1', []);
        expect(getDialect().escapeValue(null)).toBe('NULL');
        expect(getDialect().escapeValue(42)).toBe('42');
        expect(getDialect().escapeValue(true)).toBe('TRUE');
        expect(getDialect().escapeValue(false)).toBe('FALSE');
        expect(getDialect().escapeValue("John's")).toBe("'John''s'");
    });

    test.each([
        ['string', 'hello', "DEFAULT 'hello'"],
        ['date', new Date('2024-01-01T00:00:00Z'), "DEFAULT '2024-01-01 00:00:00'"],
        ['boolean', false, 'DEFAULT FALSE'],
        ['object', { enabled: true }, "DEFAULT '{\"enabled\":true}'"]
    ])('PostgreSQL formate un défaut %s avec sa syntaxe SQL', (type, value, expected) => {
        setGlobalDialect('postgres');
        expect(getDialect().formatDefaultSql(value, 'String')).toBe(expected);
    });

    test('les deux dialectes reconnaissent les défauts temporels SQL', () => {
        for (const dialect of ['mysql', 'postgres']) {
            setGlobalDialect(dialect);
            expect(getDialect().formatDefaultSql('now()', 'Date')).toBe('DEFAULT CURRENT_TIMESTAMP');
            expect(getDialect().formatDefaultSql(() => 'CURRENT_TIMESTAMP', 'Date')).toBe('DEFAULT CURRENT_TIMESTAMP');
        }
    });

    test('les defaults fonctionnels sans type restent des valeurs littérales', () => {
        for (const dialect of ['mysql', 'postgres']) {
            setGlobalDialect(dialect);
            const expected = dialect === 'mysql' ? 'DEFAULT "value"' : "DEFAULT 'value'";
            expect(getDialect().formatDefaultSql(() => 'value')).toBe(expected);
        }
    });

    test('normalise les identifiants composés contenant des espaces', () => {
        setGlobalDialect('mysql');
        expect(getDialect().escape(' users . id ')).toBe('`users`.`id`');
        expect(getDialect().escapeIdentifierList(['users', 'id'])).toBe('users, id');
    });

    test('rejette un dialecte inconnu', () => {
        expect(() => setGlobalDialect('sqlite')).toThrow('Unsupported dialect: sqlite');
    });

    test("normalizeIdentifierPart via escape avec une partie vide", () => {
        expect(() => {
            getDialect().escape(".");
        }).toThrow();
    });

    test("countKey utilise la première valeur de l'objet en fallback", () => {
        setGlobalDialect("mysql");

        const result = getDialect().countKey({
            total: 42
        });

        expect(result).toBe(42);
    });
});
