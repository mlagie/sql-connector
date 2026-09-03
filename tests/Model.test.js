const { mockExecute, mockPool, mockPgPool } = require('./mysqlMock');
const { Model } = require('../src/models/Model');
const { Schema } = require('../src/models/Schema');
const { setConnexion } = require('../src/db/connexion');
const { getDialect, setGlobalDialect } = require('../src/db/dialects');

jest.mock('@mlagie/logger', () => ({ logs: jest.fn(), error: jest.fn() }));

const dialectCases = [
    { name: 'mysql', quote: '`', pool: mockPool },
    { name: 'postgres', quote: '"', pool: mockPgPool }
];

function driverMock() {
    return getDialect().getPlaceholder(0) === '?' ? mockExecute : mockPgPool.query;
}

function resolveRows(rows, metadata = {}) {
    if (getDialect().getPlaceholder(0) === '?') mockExecute.mockResolvedValue([rows, metadata]);
    else mockPgPool.query.mockResolvedValue({ rows, rowCount: metadata.rowCount ?? 0 });
}

function resolveRowsOnce(rows, metadata = {}) {
    if (getDialect().getPlaceholder(0) === '?') mockExecute.mockResolvedValueOnce([rows, metadata]);
    else mockPgPool.query.mockResolvedValueOnce({ rows, rowCount: metadata.rowCount ?? 0 });
}

function rejectQuery(error) {
    driverMock().mockRejectedValue(error);
}

describe.each(dialectCases)('Model - $name', ({ name, quote, pool }) => {
    beforeEach(() => {
        setGlobalDialect(name);
        setConnexion(pool);
        mockExecute.mockReset();
        mockPgPool.query.mockReset();
        Model.pendingModels = [];
    });

    test('valide ses paramètres et empile le modèle', () => {
        expect(() => new Model()).toThrow();
        expect(() => new Model('users')).toThrow();
        expect(() => new Model('users', null)).toThrow();
        const model = new Model('users', { schemaDict: {} });
        expect(Model.pendingModels).toContain(model);
    });

    test('save utilise le quoteur et les placeholders du dialecte', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows({ insertId: 12, affectedRows: 1 }, { rowCount: 1 });

        const result = await model.save({ name: 'john' });
        const call = driverMock().mock.calls[0];
        expect(call[0]).toContain(`INSERT INTO ${quote}users${quote}`);
        expect(call[call.length - 1]).toEqual(['john']);
        expect(result).toBeDefined();
    });

    test('find hydrate les lignes et retourne une liste vide sans résultat', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows([{ id: 1, name: 'john' }, { id: 2, name: 'jane' }]);
        const result = await model.find({ where: { name: 'john' } });
        expect(result).toHaveLength(2);
        expect(result[0]._name).toBe('users');

        resolveRows([]);
        await expect(model.find()).resolves.toEqual([]);
    });

    test('find génère une jointure avec les identifiants du dialecte', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows([{ id: 1 }]);
        await model.find({
            select: ['id', 'name'],
            join: { table: 'roles', on: `${quote}users${quote}.${quote}role_id${quote} = ${quote}roles${quote}.${quote}id${quote}` }
        });
        expect(driverMock().mock.calls[0][0]).toContain('INNER JOIN');
        expect(driverMock().mock.calls[0][0]).toContain(`${quote}users${quote}.${quote}id${quote}`);
    });

    test('find conserve un champ déjà qualifié dans une jointure', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows([{ id: 1 }]);
        await model.find({
            select: ['roles.id'],
            join: { table: 'roles', on: 'users.role_id = roles.id' }
        });
        expect(driverMock().mock.calls[0][0]).toContain(`${quote}roles${quote}.${quote}id${quote}`);
    });

    test('count retourne le nombre et les agrégations utilisent le dialecte', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows([{ count: 5 }]);
        await expect(model.count({ name: 'john' })).resolves.toBe(5);
        resolveRows([{ total: 1 }]);
        await model.find({ select: [{ count: 'id', as: 'total' }] });
        expect(driverMock().mock.calls.at(-1)[0]).toContain(`COUNT(${quote}id${quote})`);
    });

    test('count gère les résultats vides, scalaires et les erreurs', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows([]);
        await expect(model.count()).resolves.toBe(0);
        resolveRows([7]);
        await expect(model.count()).resolves.toBe(7);
        resolveRows([null]);
        await expect(model.count()).resolves.toBe(0);
        if (name === 'mysql') mockExecute.mockResolvedValueOnce([undefined, {}]);
        else mockPgPool.query.mockResolvedValueOnce({ rows: undefined, rowCount: 0 });
        await expect(model.count()).resolves.toBe(0);
        rejectQuery(new Error('COUNT ERROR'));
        await expect(model.count()).rejects.toThrow('COUNT ERROR');
    });

    test('count utilise la première clé d’un objet et retourne zéro pour une valeur invalide', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows([{ total: '8' }]);
        await expect(model.count()).resolves.toBe(8);
        resolveRows([{ count: 'invalid' }]);
        await expect(model.count()).resolves.toBe(0);
    });

    test('delete retourne 0 ou 1 selon le résultat du driver', async () => {
        const model = new Model('users', { schemaDict: {} });
        if (name === 'mysql') resolveRows({ affectedRows: 1 });
        else resolveRows([], { rowCount: 1 });
        await expect(model.delete({ id: 1 })).resolves.toBe(1);
        if (name === 'mysql') resolveRows({ affectedRows: 0 });
        else resolveRows([], { rowCount: 0 });
        await expect(model.delete({ id: 1 })).resolves.toBe(0);
    });

    test('customRequest retourne la première ligne ou 0', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows([{ id: 1 }]);
        await expect(model.customRequest('SELECT * FROM users')).resolves.toBeDefined();
        resolveRows([]);
        await expect(model.customRequest('SELECT * FROM users')).resolves.toBe(0);
    });

    test('customRequest intercepte les erreurs', async () => {
        const model = new Model('users', { schemaDict: {} });
        rejectQuery(new Error('CUSTOM ERROR'));
        await expect(model.customRequest('SELECT')).rejects.toThrow('CUSTOM ERROR');
    });

    test('find conserve les éléments select non textuels', async () => {
        const model = new Model('users', { schemaDict: {} });
        resolveRows([{ id: 1 }]);
        await model.find({
            select: ['id', 42, { raw: 'NOW()' }],
            join: { table: 'roles', on: 'users.role_id = roles.id' }
        });
        expect(driverMock()).toHaveBeenCalled();
    });

    test('les erreurs SQL sont propagées par les opérations', async () => {
        const model = new Model('users', { schemaDict: {} });
        rejectQuery(new Error('SQL ERROR'));
        await expect(model.save({ name: 'john' })).rejects.toThrow('SQL ERROR');
        rejectQuery(new Error('SELECT ERROR'));
        await expect(model.find()).rejects.toThrow('SELECT ERROR');
        rejectQuery(new Error('DROP ERROR'));
        await expect(model.dropTable()).rejects.toThrow('DROP ERROR');
    });

    test('generate_uuid retourne un UUID unique ou null en cas de collision', async () => {
        const model = new Model('users', new Schema({ uuid: { type: String } }));
        resolveRowsOnce([{ [name === 'mysql' ? 'UUID()' : 'uuid']: 'uuid-test' }]);
        resolveRowsOnce([{ count: 0 }]);
        await expect(model.generate_uuid()).resolves.toBe('uuid-test');
        resolveRowsOnce([{ [name === 'mysql' ? 'UUID()' : 'uuid']: 'uuid-used' }]);
        resolveRowsOnce([{ count: 1 }]);
        await expect(model.generate_uuid()).resolves.toBeNull();
        expect(driverMock().mock.calls.at(-1)[0]).toContain(`WHERE ${quote}uuid${quote} = ${getDialect().getPlaceholder(0)}`);
    });

    test('generateCreateTableStatement gère types, défauts, enum et erreurs', () => {
        const model = new Model('users', { schemaDict: {} });
        const sql = model.generateCreateTableStatement({
            active: { type: Boolean, default: true },
            score: { type: 'Float', default: 12.5 },
            metadata: { type: Object, default: { test: true } },
            created_at: { type: Date, default: 'CURRENT_TIMESTAMP' },
            status: { enum: ['OPEN', 'CLOSED'] }
        });
        expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${quote}users${quote}`);
        expect(sql).toContain('BOOLEAN');
        expect(sql).toContain('FLOAT');
        expect(sql).toContain('JSON');
        expect(sql).toContain('CURRENT_TIMESTAMP');
        expect(sql).toContain('ENUM');
        expect(() => model.generateCreateTableStatement({ value: { type: 'BananaType' } })).toThrow();
        expect(() => model.generateCreateTableStatement({ value: {} })).toThrow();
        expect(() => model.generateCreateTableStatement({ id: { type: Number, primary_key: true, unique: true } })).toThrow();
    });

    test('generateCreateTableStatement couvre les contraintes et défauts SQL', () => {
        const model = new Model('users', { schemaDict: {} });
        const sql = model.generateCreateTableStatement({
            required_name: { type: String, length: 32, required: true, unique: true, customize: 'CHECK (required_name <> "")' },
            serial_id: { type: Number, auto_increment: true, primary_key: true },
            null_value: { type: String, default: null },
            date_value: { type: Date, default: new Date('2024-01-01T00:00:00Z') },
            function_value: { type: String, default: () => 3 },
            text_value: { type: String, default: 'hello' },
            bigint_value: { type: Number, default: BigInt(4) },
            boolean_value: { type: Boolean, default: false },
            object_value: { type: Object, default: { enabled: true } },
            symbol_value: { type: String, default: Symbol.for('value') }
        });
        expect(sql).toContain('NOT NULL');
        expect(sql).toContain('UNIQUE');
        expect(sql).toContain('AUTO_INCREMENT');
        expect(sql).toContain('PRIMARY KEY');
        expect(sql).toContain('CHECK');
        expect(sql).toContain('DEFAULT NULL');
        expect(sql).toContain('2024-01-01');
        expect(sql).toContain('DEFAULT 3');
        expect(sql).toContain('DEFAULT 4');
        expect(sql).toContain(name === 'mysql' ? 'DEFAULT 0' : 'DEFAULT FALSE');
        expect(sql).toContain('enabled');
        expect(sql).toContain('value');
        expect(() => model.generateCreateTableStatement({ invalid: 'UNKNOWN_TYPE' })).toThrow();
    });

    test('generateCreateTableStatement accepte les constructeurs et les ENUM typés', () => {
        const model = new Model('users', { schemaDict: {} });
        const sql = model.generateCreateTableStatement({
            created_at: Date,
            name: String,
            status: { type: String, enum: ['NEW', "OWNER'S"] }
        });
        expect(sql).toContain(`${quote}created_at${quote}`);
        expect(sql).toContain('DATETIME');
        expect(sql).toContain(`${quote}name${quote} VARCHAR(255)`);
        expect(sql).toContain("'OWNER''S'");
    });

    test('generateCreateTableStatement utilise le défaut CURRENT_TIMESTAMP pour une fonction Date', () => {
        const model = new Model('users', { schemaDict: {} });
        const sql = model.generateCreateTableStatement({
            created_at: { type: Date, default: () => new Date('2024-01-01T00:00:00Z') }
        });
        expect(sql).toContain('DEFAULT CURRENT_TIMESTAMP');
    });

    test('generateCreateTableStatement rejette un champ direct sans type', () => {
        const model = new Model('users', { schemaDict: {} });
        expect(() => model.generateCreateTableStatement({ invalid: 'UNKNOWN_TYPE' })).toThrow(
            'Field invalid has unsupported type'
        );
    });

    test('generateCreateTableStatement rejette une référence de FK invalide', () => {
        const model = new Model('users', { schemaDict: {} });
        expect(() => model.generateCreateTableStatement({
            role_id: { type: Number, foreignKey: 'roles.id' }
        })).toThrow('Invalid foreign key definition for field role_id.');
    });

    test('syncAllTables trie les dépendances et détecte les cycles', async () => {
        new Model('users', { schemaDict: { role_id: { type: Number, foreignKey: 'roles(id)' } } });
        new Model('roles', { schemaDict: { id: { type: Number } } });
        resolveRows([], { rowCount: 0 });
        await Model.syncAllTables();
        expect(driverMock()).toHaveBeenCalledTimes(2);

        Model.pendingModels = [];
        new Model('table_a', { schemaDict: { b_id: { foreignKey: 'table_b(id)' } } });
        new Model('table_b', { schemaDict: { a_id: { foreignKey: 'table_a(id)' } } });
        await expect(Model.syncAllTables()).rejects.toThrow('Cyclic foreign key dependency detected');
    });

    test('syncAllTables journalise et propage une erreur de création', async () => {
        new Model('users', { schemaDict: { id: { type: Number } } });
        rejectQuery(new Error('CREATE ERROR'));
        await expect(Model.syncAllTables()).rejects.toThrow('CREATE ERROR');
    });

    test('syncAllTables ignore les dépendances inconnues et les modèles déjà visités', async () => {
        new Model('roles', { schemaDict: { id: { type: Number } } });
        new Model('users', {
            schemaDict: {
                role_id: { type: Number, foreignKey: 'roles(id)' },
                other_id: { type: Number, foreignKey: 'missing(id)' }
            }
        });
        new Model('audits', { schemaDict: { role_id: { type: Number, foreignKey: 'roles(id)' } } });
        resolveRows([], { rowCount: 0 });
        await Model.syncAllTables();
        expect(driverMock()).toHaveBeenCalledTimes(3);
    });

    test('syncAllTables gère plusieurs tables et plusieurs FK sur une même table', async () => {
        new Model('users', { schemaDict: { id: { type: Number, primary_key: true } } });
        new Model('products', { schemaDict: { id: { type: Number, primary_key: true } } });
        new Model('warehouses', { schemaDict: { id: { type: Number, primary_key: true } } });
        new Model('orders', {
            schemaDict: {
                user_id: { type: Number, foreignKey: 'users(id)' },
                product_id: { type: Number, foreignKey: 'products(id)' },
                warehouse_id: { type: Number, foreignKey: 'warehouses(id)' }
            }
        });
        resolveRows([], { rowCount: 0 });

        await Model.syncAllTables();

        const queries = driverMock().mock.calls.map(call => call[0]);

        expect(queries).toHaveLength(4);
        expect(queries.at(-1)).toContain(`${quote}orders${quote}`);
        expect(queries.at(-1)).toContain(`FOREIGN KEY (${quote}user_id${quote}) REFERENCES ${quote}users${quote} (${quote}id${quote})`);
        expect(queries.at(-1)).toContain(`FOREIGN KEY (${quote}product_id${quote}) REFERENCES ${quote}products${quote} (${quote}id${quote})`);
        expect(queries.at(-1)).toContain(`FOREIGN KEY (${quote}warehouse_id${quote}) REFERENCES ${quote}warehouses${quote} (${quote}id${quote})`);
        expect(queries.slice(0, -1).join('\n')).toContain(`${quote}users${quote}`);
        expect(queries.slice(0, -1).join('\n')).toContain(`${quote}products${quote}`);
        expect(queries.slice(0, -1).join('\n')).toContain(`${quote}warehouses${quote}`);
    });

    test('generate_uuid retourne null si la base échoue', async () => {
        const model = new Model('users', { schemaDict: {} });
        rejectQuery(new Error('UUID ERROR'));
        await expect(model.generate_uuid()).resolves.toBeNull();
    });

    test('delete rejette les erreurs du driver', async () => {
        const model = new Model('users', { schemaDict: {} });
        rejectQuery(new Error('DELETE ERROR'));
        await expect(model.delete({ id: 1 })).rejects.toThrow('DELETE ERROR');
    });
});