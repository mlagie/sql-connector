// 1. LES MOCKS EN PREMIER
const { mockExecute, mockPool } = require('./mysqlMock');
const connexionManager = require("../src/db/connexion");

jest.mock('@mlagie/logger', () => ({
    logs: jest.fn(),
    error: jest.fn()
}));

// 2. LES IMPORTS DE L'APPLICATION
const { Model } = require('../src/models/Model');
const { Schema } = require('../src/models/Schema');
const { setConnexion } = require('../src/db/connexion');
const { sqlTypeMap } = require('../src/utils/sqlTypeMap');
const util = require("util");

describe('Tests unitaires avec Mock - Model.js (generate_uuid)', () => {
    let testModel;

    beforeAll(() => {
        setConnexion(mockPool);
        const userSchema = new Schema({
            id: { type: Number },
            uuid: { type: String }
        });
        testModel = new Model('users', userSchema);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('generate_uuid() devrait renvoyer un UUID si unique', async () => {
        mockExecute
            .mockResolvedValueOnce([
                [
                    { "UUID()": "123e4567-e89b-12d3-a456-426614174000" }
                ]
            ])
            .mockResolvedValueOnce([
                [
                    { "COUNT(*)": 0 }
                ]
            ]);

        const uuid = await testModel.generate_uuid('uuid');
        expect(uuid).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    test('generate_uuid() devrait gérer les rejets/erreurs de la base de données', async () => {
        // On simule le crash de la base de données
        mockExecute.mockRejectedValueOnce(new Error('Syntax Error ou Connexion perdue'));

        const uuid = await testModel.generate_uuid('uuid');

        // L'erreur est catchée par votre Model.js, qui log l'erreur et retourne null.
        expect(uuid).toBeNull();
    });

    test("Le constructeur doit empiler le modèle dans pendingModels", () => {
        const initialLength = Model.pendingModels.length;
        const testModel = new Model("DummyTable", { schemaDict: {} });

        expect(Model.pendingModels.length).toBe(initialLength + 1);
        expect(Model.pendingModels[Model.pendingModels.length - 1]).toBe(testModel);
    });

    test("save() doit générer un INSERT INTO correct", async () => {
        const pipelineModel = new Model("ProjectPipeline", { schemaDict: {} });
        mockExecute.mockResolvedValue([{ insertId: 12, affectedRows: 1 }]);

        const payload = { project_id: 3, name: "start_olm", source: "jenkins" };
        const result = await pipelineModel.save(payload);

        expect(result.insertId).toBe(12);
        expect(mockExecute).toHaveBeenCalled();

        const sqlGenere = mockExecute.mock.calls[0][0];
        const valeursGenerees = mockExecute.mock.calls[0][1];

        expect(sqlGenere).toContain("INSERT INTO `ProjectPipeline`");
        expect(valeursGenerees).toEqual([3, "start_olm", "jenkins"]);
    });

    test("find() doit retourner une liste d'instances hydratées", async () => {
        const pipelineModel = new Model("ProjectPipeline", { schemaDict: {} });

        // On mock la réponse sous forme de lignes (rows) renvoyées par mysql2
        mockExecute.mockResolvedValue([
            [
                { id: 1, name: "start_olm", source: "jenkins" },
                { id: 2, name: "build-job", source: "jenkins" }
            ]
        ]);

        const results = await pipelineModel.find({ where: { source: "jenkins" } });

        expect(results).toHaveLength(2);
        // On vérifie que la ligne a bien été hydratée en tant que ModelInstance
        expect(results[0]._name).toBe("ProjectPipeline");
        expect(results[0].name).toBe("start_olm");
    });

    test("count() doit renvoyer le nombre d'enregistrements", async () => {
        const pipelineModel = new Model("ProjectPipeline", { schemaDict: {} });

        // Simule le résultat d'un SELECT COUNT(*)
        mockExecute.mockResolvedValue([[{ count: 5 }]]);

        const total = await pipelineModel.count({ source: "jenkins" });
        expect(total).not.toBeNull();
    });

    test("save() doit propager une erreur SQL", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockRejectedValue(new Error("INSERT ERROR"));

        await expect(
            model.save({ name: "john" })
        ).rejects.toThrow("INSERT ERROR");
    });

    test("find() retourne un tableau vide", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockResolvedValue([[]]);

        const result = await model.find();

        expect(result).toEqual([]);
    });

    test("find() propage une erreur SQL", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockRejectedValue(new Error("SELECT ERROR"));

        await expect(
            model.find()
        ).rejects.toThrow("SELECT ERROR");
    });

    test("find() génère un INNER JOIN", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockResolvedValue([
            [{ id: 1, name: "john" }]
        ]);

        await model.find({
            select: ["id", "name"],
            join: {
                table: "roles",
                on: "`users`.`role_id` = `roles`.`id`"
            }
        });

        const sql = mockExecute.mock.calls[0][0];

        expect(sql).toContain("INNER JOIN");
    });

    test("delete() doit propager une erreur SQL", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockRejectedValue(new Error("DELETE ERROR"));

        await expect(
            model.delete({ id: 1 })
        ).rejects.toThrow(Error);
    });

    test("customRequest() retourne une instance", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockResolvedValue([
            [{ id: 1 }]
        ]);

        const result = await model.customRequest(
            "SELECT * FROM users"
        );

        expect(result).toBeDefined();
    });

    test("customRequest() retourne 0 si vide", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockResolvedValue([[]]);

        const result = await model.customRequest(
            "SELECT * FROM users"
        );

        expect(result).toBe(0);
    });

    test("customRequest() propage une erreur SQL", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockRejectedValue(
            new Error("CUSTOM ERROR")
        );

        await expect(
            model.customRequest("SELECT")
        ).rejects.toThrow("CUSTOM ERROR");
    });

    test("dropTable() exécute la requête", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockResolvedValue([{}]);

        await model.dropTable();

        expect(mockExecute).toHaveBeenCalled();
    });

    test("dropTable() propage une erreur SQL", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockRejectedValue(
            new Error("DROP ERROR")
        );

        await expect(
            model.dropTable()
        ).rejects.toThrow("DROP ERROR");
    });

    test("generateCreateTableStatement() génère un CREATE TABLE", () => {
        const model = new Model("users", {
            schemaDict: {}
        });

        const sql = model.generateCreateTableStatement({
            id: {
                type: Number,
                primary_key: true
            }
        });

        expect(sql).toContain("CREATE TABLE");
    });

    test("generateCreateTableStatement() refuse SELECT comme nom de table", () => {
        const model = new Model("SELECT", {
            schemaDict: {}
        });

        const result = model.generateCreateTableStatement({
            id: { type: Number }
        });

        expect(result).toBeUndefined();
    });

    test("syncAllTables() traite les modèles en attente", async () => {
        Model.pendingModels = [];

        new Model("users", {
            schemaDict: {
                id: {
                    type: Number
                }
            }
        });

        mockExecute.mockResolvedValue([{}]);

        await Model.syncAllTables();

        expect(mockExecute).toHaveBeenCalled();
    });

    test("generateCreateTableStatement() couvre les types spéciaux", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            active: {
                type: Boolean,
                default: true
            },
            score: {
                type: "Float",
                default: 12.5
            },
            metadata: {
                type: Object,
                default: { test: true }
            },
            created_at: {
                type: Date,
                default: "CURRENT_TIMESTAMP"
            }
        });

        expect(sql).toContain("BOOLEAN");
        expect(sql).toContain("FLOAT");
        expect(sql).toContain("JSON");
        expect(sql).toContain("CURRENT_TIMESTAMP");
    });

    test("generateCreateTableStatement() refuse les types inconnus", () => {
        const model = new Model("users", { schemaDict: {} });

        expect(() => {
            model.generateCreateTableStatement({
                test: {
                    type: "BananaType"
                }
            });
        }).toThrow();
    });

    test("generateCreateTableStatement() couvre field.type qui est une string", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            age: {
                type: "Number"
            }
        });

        expect(sql).toContain("INT");
    });

    test("generateCreateTableStatement() couvre field.name", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            created_at: Date
        });

        expect(sql).toContain("DATETIME");
    });

    test("syncAllTables avec foreign key", async () => {
        Model.pendingModels = [];

        new Model("roles", {
            schemaDict: {
                id: {
                    type: Number
                }
            }
        });

        new Model("users", {
            schemaDict: {
                role_id: {
                    type: Number,
                    foreignKey: "roles(id)"
                }
            }
        });

        mockExecute.mockResolvedValue([{}]);

        await Model.syncAllTables();

        expect(mockExecute).toHaveBeenCalled();
    });

    test("syncAllTables propage les erreurs SQL", async () => {
        Model.pendingModels = [];

        new Model("users", {
            schemaDict: {
                id: {
                    type: Number
                }
            }
        });

        mockExecute.mockRejectedValue(
            new Error("CREATE ERROR")
        );

        await expect(
            Model.syncAllTables()
        ).rejects.toThrow("CREATE ERROR");
    });

    test("ENUM sans type", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            status: {
                enum: ["OPEN", "CLOSED"]
            }
        });

        expect(sql).toContain("status ENUM");
    });

    test("find conserve les objets select", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockResolvedValue([[{ id: 1 }]]);

        await model.find({
            select: [
                {
                    count: "*",
                    as: "total"
                }
            ]
        });

        expect(mockExecute).toHaveBeenCalled();
    });
    test("delete retourne 1 si suppression", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockResolvedValue([
            {
                affectedRows: 1
            }
        ]);

        const result = await model.delete({
            id: 1
        });

        expect(result).toBe(1);
    });

    test("generate_uuid retourne un uuid unique", async () => {
        mockExecute
            .mockResolvedValueOnce([
                [{ "UUID()": "uuid-test" }]
            ])
            .mockResolvedValueOnce([
                [{ "COUNT(*)": 0 }]
            ]);

        const result = await testModel.generate_uuid();

        expect(result).toBe("uuid-test");
    });

    test("generateCreateTableStatement supporte un constructeur JS", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            created_at: Date
        });

        expect(sql).toContain("DATETIME");
    });

    test("default fonction sur un type Date", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            created_at: {
                type: Date,
                default: () => new Date()
            }
        });

        expect(sql).toContain("DEFAULT CURRENT_TIMESTAMP");
    });

    test("default Date", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            created_at: {
                type: Date,
                default: new Date("2024-01-01T12:00:00Z")
            }
        });

        expect(sql).toContain("2024-01-01");
    });

    test("default avec un symbole", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            test: {
                type: String,
                default: Symbol.for("hello")
            }
        });

        expect(sql).toContain("hello");
    });

    test("primary_key et unique sont incompatibles", () => {
        const model = new Model("users", { schemaDict: {} });

        expect(() =>
            model.generateCreateTableStatement({
                id: {
                    type: Number,
                    primary_key: true,
                    unique: true
                }
            })
        ).toThrow();
    });

    test("enum avec type défini", () => {
        const model = new Model("users", { schemaDict: {} });

        const sql = model.generateCreateTableStatement({
            role: {
                type: String,
                enum: ["ADMIN", "USER"]
            }
        });

        expect(sql).toContain("ENUM");
    });

    test("save retourne le premier résultat mysql", async () => {
        const model = new Model("users", { schemaDict: {} });

        mockExecute.mockResolvedValue([
            {
                insertId: 123,
                affectedRows: 1
            }
        ]);

        const result = await model.save({
            name: "john"
        });

        expect(result).toEqual({
            insertId: 123,
            affectedRows: 1
        });
    });

    test("generate_uuid retourne un uuid unique", async () => {
        mockExecute
            .mockResolvedValueOnce([
                [{ "UUID()": "uuid-123" }]
            ])
            .mockResolvedValueOnce([
                [{ "COUNT(*)": 0 }]
            ]);

        const result = await testModel.generate_uuid();

        expect(result).toBe("uuid-123");
    });

    test("find() - Options Advanced - Doit gérer les jointures de table et ignorer les éléments du select qui ne sont pas des chaînes", async () => {
        // 1. Initialisation de votre modèle
        const pipelineModel = new Model("ProjectPipeline", { schemaDict: {} });

        // Simule une réponse MySQL nominale pour que la méthode find() aille jusqu'au bout
        mockExecute.mockResolvedValue([[{ id: 1 }]]);

        // 2. On configure des options avec un 'join' et un tableau 'select' mixte
        await pipelineModel.find({
            select: [
                "id",             // Chaîne standard (sera préfixée par la table principale)
                "name_pipeline",  // Chaîne commençant par 'name' (sera préfixée par la table de jointure)
                12345,            // 🔥 UN NOMBRE (Pas une string) : déclenchera le 'return item' direct
                { raw: "NOW()" }  // 🔥 UN OBJET (Pas une string) : déclenchera également le 'return item'
            ],
            join: {
                table: "Users",
                on: { "ProjectPipeline.user_id": "Users.id" }
            }
        });

        // 3. Validation de la requête SQL générée en arrière-plan
        const lastQuery = mockExecute.mock.calls[0][0];

        // Vérifie que les chaînes ont bien été traitées avec leur table respective
        expect(lastQuery).toContain("`ProjectPipeline`.`id`");
        expect(lastQuery).toContain("`Users`.`name_pipeline`");

        // Le test passe avec succès et la ligne de couverture "return item" est validée !
    });

    test("generate_uuid() - Doit renvoyer null si l'UUID généré existe déjà en base de données (Collision)", async () => {
        // 1. Initialisation de votre modèle
        const pipelineModel = new Model("ProjectPipeline", { schemaDict: {} });

        // 2. Configuration des réponses successives de la base de données (mocking séquentiel)
        mockExecute
            // Premier appel MySQL : La fonction native SELECT UUID(); génère un UUID virtuel
            .mockResolvedValueOnce([[{ "UUID()": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d" }]])
            // Deuxième appel MySQL : La requête de vérification COUNT(*) indique que cet UUID existe déjà (COUNT = 1)
            .mockResolvedValueOnce([[{ "COUNT(*)": 1 }]]);

        // 3. Exécution de la méthode : comme COUNT(*) vaut 1, la condition == 0 est FAUSSE
        const uuidResult = await pipelineModel.generate_uuid("uuid_field");

        // 4. Vérification que la méthode a bien retourné null suite à la collision
        expect(uuidResult).toBeNull();

        // Optionnel : On s'assure que la requête générée ciblait bien le bon champ de condition
        const lastSqlQuery = mockExecute.mock.calls[1][0];
        expect(lastSqlQuery).toContain("WHERE `uuid_field` = ?");
    });
});

describe("Model Unit Tests - Deep Coverage", () => {

    beforeAll(() => {
        connexionManager.setConnexion(mockPool);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("getColumnDefinition & formatDefaultSql - Traitement des cas limites et d'erreurs", () => {
        const myModel = new Model("Users", {});

        // Lignes 92-94 : Conflit Primary Key ET Unique
        expect(() => {
            myModel.generateCreateTableStatement({
                id: { type: "INT", primary_key: true, unique: true }
            });
        }).toThrow("Field 'id' cannot be both PRIMARY KEY and UNIQUE.");

        // Formatage de valeurs par défaut exotiques (Fonction date, Date object, Objets complexes)
        // Note: Pour tester indirectement getColumnDefinition, on l'appelle via generateCreateTableStatement
        const complexSchema = {
            created_at: { type: Date, default: () => new Date() }, // Ligne 34
            updated_at: { type: "Timestamp", default: "Now" },        // Ligne 37
            metadata: { type: Boolean, default: false }       // Ligne 49
        };
        const sql = myModel.generateCreateTableStatement(complexSchema);
        expect(sql).toContain("DEFAULT CURRENT_TIMESTAMP");
        expect(sql).toContain('CREATE TABLE IF NOT EXISTS `Users` (`created_at` DATETIME DEFAULT CURRENT_TIMESTAMP, `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP, `metadata` BOOLEAN DEFAULT 0) ENGINE=InnoDB');

        expect(() => {
            myModel.generateCreateTableStatement({
                ghost: { type: "UNKNOWN_TYPE" }
            });
        }).toThrow("Field ghost has unsupported type UNKNOWN_TYPE."); // Si non bloqué par l'étape 100, l'étape 210 lèvera l'exception d'un type invalide
    });

    test("syncAllTables() - Gestion nominale de création et détection des cycles de clés étrangères", async () => {
        Model.pendingModels = []; // On nettoie les modèles empilés

        // Création de deux modèles interdépendants pour forcer la détection cyclique (Ligne 163)
        const modelA = new Model("TableA", { schemaDict: { b_id: { foreignKey: "TableB(id)" } } });
        const modelB = new Model("TableB", { schemaDict: { a_id: { foreignKey: "TableA(id)" } } });

        // Ligne 163 : Doit lever une erreur à cause de la boucle TableA -> TableB -> TableA
        await expect(Model.syncAllTables()).rejects.toThrow("Cyclic foreign key dependency detected: TableA -> TableB -> TableA");

        // Cas nominal : Nettoyage et ré-empilement de modèles sans cycle
        Model.pendingModels = [];
        const modelSingle = new Model("TableNominale", { schemaDict: { id: { type: "Number" } } });

        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
        await Model.syncAllTables();

        expect(mockExecute).toHaveBeenCalled();
    });

    test("generateCreateTableStatement() - Doit rejeter les structures vides et les mots réservés", () => {
        // Champ sans aucun type défini
        const modelInvalid = new Model("TestTable", {});
        expect(() => {
            modelInvalid.generateCreateTableStatement({ undefined_field: {} });
        }).toThrow("Field undefined_field has no type defined.");

        // Type invalide ou non supporté passé sous forme de string directe
        expect(() => {
            modelInvalid.generateCreateTableStatement({ invalid_field: "BAD_TYPE_STRING" });
        }).toThrow("Field invalid_field has unsupported type");

        // Utilisation d'un mot-clé réservé SQL comme nom de table (ex: SELECT, ALTER)
        const modelReserved = new Model("SELECT", {});
        const result = modelReserved.generateCreateTableStatement({ id: { type: "Number" } });
        expect(result).toBeUndefined(); // Renvoie undefined car le log d'erreur bloque la requête
    });

    test("find() - Ligne 259 - Doit intercepter et propager les erreurs SQL", async () => {
        const myModel = new Model("Users", { schemaDict: {} });
        mockExecute.mockRejectedValue(new Error("Syntax Error near WHERE"));

        await expect(myModel.find({ select: ["id"] })).rejects.toThrow("Syntax Error near WHERE");
    });

    test("count() - Ligne 278 - Doit générer la requête COUNT globale sans clause WHERE si aucun filtre n'est fourni", async () => {
        const myModel = new Model("Users", { schemaDict: {} });

        // Simule un retour valide pour l'instanciation de l'instance
        mockExecute.mockResolvedValue([[{ count: 42 }]]);

        // On appelle count() sans paramètre (filter = undefined)
        await myModel.count();

        const sqlRequest = mockExecute.mock.calls[0][0];
        // La requête ne doit pas avoir de mot clé WHERE attaché
        expect(sqlRequest).not.toContain("WHERE");
        expect(sqlRequest).toContain("SELECT COUNT(*) as count FROM `Users`");
    });

    test("customRequest() - Ligne 295 - Doit lever une exception typée en cas de crash SQL", async () => {
        const myModel = new Model("Users", { schemaDict: {} });
        mockExecute.mockRejectedValue(new Error("Table doesn't exist"));

        await expect(myModel.customRequest("SELECT * FROM non_existent", "CRITICAL_GET")).rejects.toThrow("Table doesn't exist");
    });

    test("dropTable() - Ligne 329 - Doit rejeter la promesse si l'instruction DROP échoue", async () => {
        const myModel = new Model("Users", { schemaDict: {} });
        mockExecute.mockRejectedValue(new Error("Lock wait timeout exceeded"));

        await expect(myModel.dropTable()).rejects.toThrow("Lock wait timeout exceeded");
    });
});