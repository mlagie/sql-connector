// 1. CHARGER LE MOCK EN PREMIER
const { mockPool, mockEnd, mockPgPool } = require('./mysqlMock');

// 2. CHARGER LES MODULES DU PROJET ENSUITE
const { connect, logout } = require('../src/db/connect'); // Ajustez le chemin vers votre dossier src
const { getConnexion } = require('../src/db/connexion');
const { setGlobalDialect } = require('../src/db/dialects');
const mysql = require('mysql2');
const { Pool: PgPool } = require('pg');
const { logs, error } = require('@mlagie/logger');

jest.mock('@mlagie/logger', () => ({
    logs: jest.fn(),
    error: jest.fn()
}));

describe("Tests unitaires avec Mock - connect.js", () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        setGlobalDialect('mysql');
    });

    test("connect() devrait créer un pool mysql2 et définir la connexion globale", async () => {
        const config = { host: 'localhost', user: 'root', database: 'test' };

        await connect(config);

        // Maintenant mysql.createPool est bien un mock Jest !
        expect(mysql.createPool).toHaveBeenCalledWith(config);
        expect(getConnexion()).toBe(mockPool);
    });

    test("connect() devrait créer un pool pg pour le dialecte postgres", async () => {
        const config = { host: 'localhost', user: 'postgres', database: 'test' };

        await connect(config, 'postgres');

        expect(PgPool).toHaveBeenCalledWith(config);
        expect(getConnexion()).toBe(mockPgPool);
    });

    test("logout() devrait fermer proprement la connexion du pool", async () => {
        // On simule une connexion active d'abord
        const { setConnexion } = require('../src/db/connexion');
        setConnexion(mockPool);
        mockEnd.mockImplementationOnce(callback => callback(null));

        await logout();

        expect(mockEnd).toHaveBeenCalledWith(expect.any(Function));
        expect(logs).toHaveBeenCalledWith("Database connection closed");
        expect(error).not.toHaveBeenCalled();
    });

    test("logout() doit gérer une erreur lors de la fermeture", async () => {
        const { setConnexion } = require('../src/db/connexion');
        setConnexion(mockPool);
        mockPool.end.mockImplementation((callback) => {
            callback(new Error("Close Error"));
        });

        await logout();

        expect(mockPool.end).toHaveBeenCalledWith(expect.any(Function));
        expect(error).toHaveBeenCalledWith("Error closing database connection: Error: Close Error");
        expect(logs).not.toHaveBeenCalled();
    });
});