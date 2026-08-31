const { ModelInstance } = require("../src/models/ModelInstance");
// 1. Importez le vrai gestionnaire de connexion de votre ORM
const connexionManager = require("../src/db/connexion");
const util = require("util");
const { Schema } = require("../src/models/Schema");
const { Model } = require("../src/models/Model");
const { logs } = require("@mlagie/logger");
// 2. Définissez votre structure de mock locale
const mockExecute = jest.fn();
const mockPool = {
    promise: () => ({
        execute: mockExecute
    })
};

// Empêche les logs d'erreurs volontaires des tests de polluer le terminal
jest.mock('@mlagie/logger', () => ({
    error: jest.fn(),
    logs: jest.fn(),
    serveur: jest.fn()
}));

describe("ModelInstance Unit Tests - v2.0.6", () => {

    beforeAll(() => {
        // 3. 🔥 LE FIX MAGIQUE : On force l'ORM à utiliser le mock localement
        // Cela écrase la connexion réelle par votre pool simulé sans dépendre du comportement de jest.mock()
        connexionManager.setConnexion(mockPool);
        const userSchema = new Schema({
            email: { type: String },
            username: { type: String },
            uuid: { type: String }
        });
        testModel = new Model('users', userSchema);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("updateOne() doit exécuter une requête UPDATE valide", async () => {
        const mockData = { id: 1, name: "callisto-report" };
        const mockSchema = { schemaDict: { id: { primary_key: true } } };
        const instance = new ModelInstance("ProjectPipeline", mockData, mockSchema);

        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        // Appel de la méthode
        await instance.updateOne({ name: "nouveau-nom" });

        expect(mockExecute).toHaveBeenCalled();
    });

    test("Hydratation - _getTargetRow doit gérer un tableau de données imbriqué", () => {
        // Lignes 47, 52 : Couvre le cas où rows est un tableau de lignes
        const instance = new ModelInstance("ProjectPipeline", [[{ id: 99, name: "nested" }]]);
        expect(instance.id).toBe(99);
    });

    test("updateOne() - Doit lever une erreur et la logger en cas d'échec SQL", async () => {
        // Lignes 129-130 : Bloc .catch de updateOne
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });
        mockExecute.mockRejectedValue(new Error("MySQL Down"));

        await expect(instance.updateOne({ name: "fail" })).rejects.toThrow("MySQL Down");
    });

    test("delete() - Doit exécuter une suppression groupée et gérer le succès/échec", async () => {
        // Lignes 138 - 154 : Méthode delete(filter) globale
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });

        // Cas 1 : Succès avec lignes affectées
        mockExecute.mockResolvedValue([{ affectedRows: 2 }]);
        let result = await instance.delete({ status: "old" });
        expect(result).toBe(1);

        // Cas 2 : Aucune ligne affectée
        mockExecute.mockResolvedValue([{ affectedRows: 0 }]);
        result = await instance.delete({ status: "old" });
        expect(result).toBe(0);

        // Cas 3 : Échec SQL (Couvre le bloc .catch de delete)
        mockExecute.mockRejectedValue(new Error("Delete Failed"));
        await expect(instance.delete({ status: "old" })).rejects.toThrow("Delete Failed");
    });

    test("deleteOne() - Doit lever une erreur en cas d'échec SQL", async () => {
        // Lignes 173-176 : Bloc .catch de deleteOne
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });
        mockExecute.mockRejectedValue(new Error("MySQL Fatal Delete"));

        await expect(instance.deleteOne()).rejects.toThrow("MySQL Fatal Delete");
    });

    test("customRequest() - Doit exécuter du SQL brut et hydrater ou renvoyer 0", async () => {
        // Lignes 185-195 : Méthode customRequest
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });

        // Cas 1 : La requête renvoie des données
        mockExecute.mockResolvedValue([[{ id: 5, custom_field: "value" }]]);
        const resData = await instance.customRequest("SELECT * FROM optimization");
        expect(resData).toBeDefined();

        // Cas 2 : La requête renvoie un tableau vide (Ligne 192 : rows[0].length == 0)
        mockExecute.mockResolvedValue([[]]);
        const resEmpty = await instance.customRequest("SELECT * FROM empty");
        expect(resEmpty).toBe(0);

        // Cas 3 : Échec de la requête (Couvre le bloc .catch de customRequest)
        mockExecute.mockRejectedValue(new Error("Query Bad Syntax"));
        await expect(instance.customRequest("SELECT BAD")).rejects.toThrow("Query Bad Syntax");
    });

    // === COUVRE LIGNES 47, 52 (Setters & Échec JSON.parse) ===
    test("Hydratation - Doit exécuter les setters dynamiques et capter les faux JSON", () => {
        const mockData = { id: 1, config: "{malformed json" };
        const instance = new ModelInstance("ProjectPipeline", mockData);

        // Ligne 52 : Déclenche le setter dynamique (setSafe)
        instance.id = 45;
        expect(instance.id).toBe(45);
    });

    // === COUVRE LIGNES 75-79 (JSON parsing dans getRecordData) ===
    test("getRecordData - Doit analyser les chaînes JSON ou renvoyer le tableau brut", () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });

        // On simule une structure où _data est un tableau contenant une chaîne JSON
        instance._data = ["[{\"id\": 10, \"name\": \"json-extracted\"}]"];

        const record = instance.getRecordData();
        expect(record).toBeDefined();
    });

    // === COUVRE LIGNES 99-102 (Extraction de Clé Primaire avec succès) ===
    test("updateOne() - Doit extraire la clé primaire depuis le dictionnaire de schéma", async () => {
        const mockData = { id: 77, name: "pipeline-target" };
        const mockSchema = { schemaDict: { id: { primary_key: true } } };
        const instance = new ModelInstance("ProjectPipeline", mockData, mockSchema);

        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        // Lignes 99-102 : Utilise 'id' comme critère WHERE unique
        const affected = await instance.updateOne({ name: "pipeline-updated" });
        expect(affected).toBe(1);

        const sqlGenerated = mockExecute.mock.calls[0];
        expect(sqlGenerated).toEqual(["UPDATE `ProjectPipeline` SET `name` = ? WHERE `id` = ?", ["pipeline-updated", 77]]);
    });

    // === COUVRE LIGNES 120-124 (Bloc catch de repli de updateOne) ===
    test("updateOne() - Doit basculer sur le fallback d'évaluation si le parsing crash", async () => {
        const mockData = { id: 1, name: "pipeline-fallback-test" };
        const instance = new ModelInstance("ProjectPipeline", mockData);

        // 🔥 LE FIX : On passe un dictionnaire de schéma structurellement valide (un objet)
        // mais totalement vide. L'évaluation des clés primaires échouera proprement,
        // ce qui forcera l'activation du bloc catch de repli (fallback) de updateOne
        // sans provoquer de panne sur Reflect.get !
        instance._schema = { schemaDict: {} };

        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        // Exécution de la méthode
        const affected = await instance.updateOne({ status: "patched" });
        expect(affected).toBe(1);

        const sqlGenerated = mockExecute.mock.calls[0];
        // On valide que le traitement s'est terminé avec succès
        expect(sqlGenerated).toEqual(["UPDATE `ProjectPipeline` SET `status` = ? WHERE `id` = ? AND `name` = ?", ["patched", 1, "pipeline-fallback-test"]]);
    });

    // === COUVRE LIGNE 138 (delete avec affectedRows > 0) ===
    test("delete() - Doit renvoyer 1 si des éléments ont été affectés par la suppression", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });

        // Ligne 138 (Cas affecté)
        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
        const result = await instance.delete({ status: "archived" });
        expect(result).toBe(1);
    });

    // === COUVRE LIGNE 178 (deleteOne avec affectedRows > 0) ===
    test("deleteOne() - Doit renvoyer 1 si l'élément courant a été supprimé", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 200 });

        // Ligne 178 (Cas affecté)
        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
        const result = await instance.deleteOne();
        expect(result).toBe(1);
    });

    // === COUVRE LES BLOCS D'ERREURS DÉJÀ EXISTANTS ===
    test("updateOne() - Doit lever une erreur et la logger en cas d'échec SQL", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });
        mockExecute.mockRejectedValue(new Error("MySQL Down"));

        await expect(instance.updateOne({ name: "fail" })).rejects.toThrow("MySQL Down");
    });

    test("delete() - Doit propager l'erreur en cas de rejet SQL", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });
        mockExecute.mockRejectedValue(new Error("Delete Failed"));

        await expect(instance.delete({ status: "old" })).rejects.toThrow("Delete Failed");
    });

    test("deleteOne() - Doit lever une erreur en cas d'échec SQL", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });
        mockExecute.mockRejectedValue(new Error("MySQL Fatal Delete"));

        await expect(instance.deleteOne()).rejects.toThrow("MySQL Fatal Delete");
    });

    test("customRequest() - Doit exécuter du SQL brut et hydrater ou renvoyer 0", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });

        mockExecute.mockResolvedValue([[{ id: 5, custom_field: "value" }]]);
        const resData = await instance.customRequest("SELECT * FROM optimization");
        expect(resData).toBeDefined();

        mockExecute.mockResolvedValue([[]]);
        const resEmpty = await instance.customRequest("SELECT * FROM empty");
        expect(resEmpty).toBe(0);

        mockExecute.mockRejectedValue(new Error("Query Bad Syntax"));
        await expect(instance.customRequest("SELECT BAD")).rejects.toThrow("Query Bad Syntax");
    });

    test("Getter dynamique - retourne la valeur brute si JSON.parse échoue", () => {
        const instance = new ModelInstance("ProjectPipeline", {
            config: "{invalid-json}"
        });

        expect(instance.config).toBe("{invalid-json}");
    });

    test("updateOne() met à jour les données locales après succès", async () => {
        const instance = new ModelInstance(
            "ProjectPipeline",
            { id: 1, name: "before" }
        );

        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        await instance.updateOne({ name: "after" });

        expect(instance._data.name).toBe("after");
    });

    test("updateOne() met à jour le premier élément d'un tableau", async () => {
        const instance = new ModelInstance(
            "ProjectPipeline",
            [{ id: 1, name: "before" }]
        );

        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        await instance.updateOne({ name: "after" });

        expect(instance._data[0].name).toBe("after");
    });

    test("delete() retourne 0 quand aucune ligne n'est supprimée", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });

        mockExecute.mockResolvedValue([{ affectedRows: 0 }]);

        expect(await instance.delete({ id: 1 })).toBe(0);
    });

    test("delete() retourne 1 quand une ligne est supprimée", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });

        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        expect(await instance.delete({ id: 1 })).toBe(1);
    });

    test("customRequest() retourne les données hydratées", async () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1 });

        mockExecute.mockResolvedValue([
            [{ id: 123, name: "test" }]
        ]);

        const result = await instance.customRequest("SELECT * FROM test");

        expect(result).toEqual([{ id: 123, name: "test" }]);
    });

    test("toJSON() retourne les données locales", () => {
        const instance = new ModelInstance("ProjectPipeline", { id: 1, name: "test" });

        expect(instance.toJSON()).toEqual({ id: 1, name: "test" });
    });

    test("updateOne parse une chaîne JSON", async () => {
        const instance = new ModelInstance(
            "users",
            '{"id":1,"name":"john"}'
        );

        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        await instance.updateOne({
            name: "updated"
        });

        expect(mockExecute).toHaveBeenCalled();
    });

    test("updateOne() - Doit basculer sur le bloc catch global et exécuter le fallback", async () => {
        // 1. On instancie normalement un ModelInstance avec un objet JSON valide
        const mockData = { id: 10, status: "active" };
        const instance = new ModelInstance("ProjectPipeline", mockData);

        // 2. On espionne la méthode getRecordData() de cette instance spécifique
        const spy = jest.spyOn(instance, 'getRecordData');

        // 3. Premier appel (dans le try principal) : On jette une erreur pour forcer le passage au catch
        // Deuxième appel (dans le bloc catch) : On renvoie l'objet de secours valide mockData
        spy.mockImplementationOnce(() => {
            throw new Error("Forced exception to enter catch block");
        }).mockImplementationOnce(() => {
            return mockData;
        });

        // Simule un retour positif de la base de données
        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        // 4. Exécution de la méthode
        const affected = await instance.updateOne({ status: "patched" });

        expect(affected).toBe(1);
        expect(mockExecute).toHaveBeenCalled();

        const sqlGenerated = mockExecute.mock.calls[0];
        expect(sqlGenerated).toEqual(["UPDATE `ProjectPipeline` SET `status` = ? WHERE `id` = ? AND `status` = ?", ["patched", 10, "active"]]);

        // 5. On nettoie le spy pour ne pas impacter les autres tests
        spy.mockRestore();
    });

});