# Documentation du module sql-connector

![GitHub package.json version](https://img.shields.io/github/package-json/v/lagie-marin/sql-connector?color=#008000) ![NPM Downloads](https://img.shields.io/npm/d18m/%40mlagie%2Fsql-connector?color=#008000) ![NPM Downloads](https://img.shields.io/npm/dw/%40mlagie%2Fsql-connector?color=#008000) ![GitHub followers](https://img.shields.io/github/followers/lagie-marin?style=plastic&color=color%3D%23008000) ![GitHub repo size](https://img.shields.io/github/repo-size/lagie-marin/sql-connector?color=%green)
 ![GitHub last commit](https://img.shields.io/github/last-commit/lagie-marin/sql-connector)

[English](../../README.md) | Français

Le module sql-connector permet de gérer des connexions MySQL, de définir des schémas, de synchroniser automatiquement des tables et d'exposer des modèles pour manipuler les données simplement.

## Importation

```javascript
const { Schema, connect, logout, Model, ModelInstance, client, sqlTypeMap } = require('sql-connector');
```

## Connexion à la base

`connect(config)` ouvre une connexion MySQL à partir d'un objet de configuration compatible avec mysql2.

```javascript
const config = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydatabase'
};

await connect(config);
```

`logout()` ferme proprement la connexion.

```javascript
await logout();
```

## Schéma

`Schema` décrit la structure d'une table. Chaque champ peut utiliser les propriétés suivantes.

| Propriété      | Type                             | Description                 |
|----------------|----------------------------------|-----------------------------|
| type           | `SqlType` ou `{ name: SqlType }` | Type SQL du champ           |
| length         | `number`                         | Longueur maximale           |
| required       | `boolean`                        | Champ obligatoire           |
| default        | `any`                            | Valeur par défaut           |
| unique         | `boolean`                        | Valeur unique               |
| auto_increment | `boolean`                        | Auto-incrément              |
| foreignKey     | `string`                         | Référence de clé étrangère  |
| enum           | `string[]`                       | Liste de valeurs autorisées |
| primary_key    | `boolean`                        | Clé primaire                |
| customize      | `string`                         | Options SQL additionnelles  |

```javascript
const { Schema, Model, sqlTypeMap } = require("@mlagie/sql-connector");

const userSchema = new Schema({
  id: {
    type: Number,
    auto_increment: true,
    primary_key: true
  },
  email: {
    type: String,
    length: 255,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending'
  },
    uuid: {
        type: String,
        required: true,
        primary_key: true,
        length: 36
    },
    my_uuid: {
        type: String,
        required: true,
        length: 36
    },
    created_at: {
        type: Date,
        default: sqlTypeMap.CurrentTimestamp
    }
});

module.exports = new Model("User", userSchema);
```

## Synchronisation des tables

`Model.syncAllTables()` compare les schémas JS avec la base et applique uniquement les différences utiles.

- Ajout de colonne: automatique.

```javascript
await Model.syncAllTables();
```

Point important: ne combinez pas `primary_key: true` et `unique: true` sur le même champ. Une clé primaire est déjà unique et non nulle.

## Modèles

`Model` représente une table SQL.

Méthodes principales:

- `save(data)` pour insérer une ligne
- `find(filter, fields)` pour récupérer plusieurs entrées
- `count(filter)` pour compter les lignes
- `customRequest(custom)` pour exécuter une requête SQL personnalisée
- `delete(filter)` pour supprimer une entrée
- `dropTable()` pour supprimer la table
- `generate_uuid()` pour générer un UUID unique

```javascript
const userModel = new Model('users', userSchema);

await Model.syncAllTables();
await userModel.save({ email: 'user@example.com', status: 'active' });

const user = await userModel.find({ where: { email: 'user@example.com' }});
await user[0].deleteOne();
```

## Fonction save

Enregistre les données dans la table de la base de données.

- **Parameters** `data` *(Object)* - Les données à insérer dans la table.
- **Returns** `Promise<Object>` - Une promesse avec le résultat de l'insertion.
- **Throws** `Error` - Lève une erreur si l'insertion échoue.

```js
const User = require("user");

async function createUser(email, stat) {
    if (!email || !stat) {
        console.error("Email & stat is required");
        return;
    }
    await User.save({ email: email, status: stat });

}
```

## Fonction find

Récupère des enregistrements de la table.

- **Paramètres** `options` *(Object)* – Options de la requête.
- **Paramètres** `options.select` *(Array<string|SelectAggregation>)* – Champs, agrégations ou transformations à retourner.
- **Paramètres** `options.where` *(Object / string)* – Conditions de filtrage (objet clé/valeur ou clause brute sous forme de chaîne).
- **Paramètres** `options.groupBy` *(string[])* – Champs utilisés pour grouper les résultats.
- **Paramètres** `options.orderBy` *(Array<string|OrderByOption>)* – Règles de tri.
- **Paramètres** `options.join` *(JoinOption / JoinOption[])* – Structures de configuration pour les jointures de tables.
- **Paramètres** `options.limit` *(number)* – Nombre maximal de résultats à retourner.
- **Retourne** `Promise<Array<ModelInstance>>`

### Options avancées de `select` (`SelectAggregation`)

Chaque élément du tableau `select` peut être soit une chaîne de caractères standard (nom brut de la colonne), soit un objet offrant des fonctionnalités SQL et des agrégations avancées :

| Propriété dans l'objet `select` | Type              | Description                                                                                               |                                     Exemple / SQL Généré                                            |
|---------------------------------|-------------------|-----------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| `col`                           | `string`          | Sélectionne une colonne de table simple, sans agrégation.                                                 | `{ col: 'email' }` $\rightarrow$ \`email\`                                                          |
| `sum`                           | `string`          | Calcule la somme de toutes les valeurs numériques d'une colonne.                                          | `{ sum: 'error' }` $\rightarrow$ `SUM(`\`error\``)`                                                 |
| `distinct`                      | `string`          | Applique une contrainte DISTINCT sur la colonne spécifiée.                                                | `{ distinct: 'status' }` $\rightarrow$ `DISTINCT `\`status\`                                        |
| `dateFormat`                    | `[string, string]`| Formate une colonne de type Date en utilisant le formatage standard MySQL (`[colonne, chaine_de_format]`).| `{ dateFormat: ['created_at', '%Y-%m'] }` $\rightarrow$ `DATE_FORMAT(`\`created_at\``, '%Y-%m')`    |
| `count`                         | `string`          | Comptage de lignes standard (ignore les valeurs `NULL`).                                                  | `{ count: 'id' }` $\rightarrow$ `COUNT(`\`id\``)`                                                   |
| `count` (Array)                 | `string[]`        | Calcule le nombre de combinaisons uniques sur plusieurs colonnes (COUNT DISTINCT).                        | `{ count: ['team', 'source'] }` $\rightarrow$ `COUNT( DISTINCT `\`team\``, `\`source\`` )`          |
| `count` (Object)                | `Object`          | Agrégation conditionnelle automatisée (`CASE WHEN`). Idéal pour les indicateurs clés (KPIs) et statuts.   | `{ count: { deletedAt: null } }` $\rightarrow$ `COUNT(CASE WHEN `\`deletedAt\`` = NULL THEN 1 END)` |
| `as`                            | `string`          | Définit un identifiant de sortie personnalisé ou un alias d'agrégation (SQL `AS`).                        | `{ count: 'id', as: 'total' }` $\rightarrow$ `COUNT(`\`id\``) AS `\`total\`                         |

---

### Options complexes structurées (`orderBy` & `join`)

#### OrderByOption

Permet d'appliquer un tri explicite sur une ou plusieurs colonnes :

- **field** `(string)` : Le nom de la colonne cible sur laquelle appliquer le tri.
- **direction** `('ASC'\|'DESC')` : Le sens du tri (Par défaut : `'ASC'`).

#### JoinOption

Spécifie une ou plusieurs jointures de tables relationnelles :

- **table** `(string)` : Nom de la table cible à joindre.
- **on** `(string)` : Chaîne de caractères représentant la condition de jointure (ex: `"MyTable.project_id = Projects.id"`).
- **alias** `(string)` *(Optionnel)* : Un alias SQL alternatif pour la table jointe.
- **type** `('INNER'\|'LEFT'\|'RIGHT')` *(Optionnel)* : Type de jointure SQL (Par défaut : `'INNER'`).

---

## Exemple find

```js
const User = require("user");

await User.find({
  select: [
    { dateFormat: ['date_day', '%Y-%m'], as: 'period' },
    { sum: 'error' },
    { sum: 'reload' },
  ],
  groupBy: ['period'],
  orderBy: [{ field: 'period', direction: 'ASC' }],
  limit: 10
});
```

```js
const User = require("user");

await User.find({
  select: [
    "email"
  ],
  where: {
    id: 1
  }
})
```

### Exemples avancés avec `find`

#### 1. Comptage standard, distinct et multi-colonnes

Comptez les lignes globales parallèlement à des combinaisons uniques multi-colonnes, comme l'identification des couples uniques d'équipes et de sources de pipelines :

```js
const { MyTable } = require("./models");

const stats = await MyTable.find({
  select: [
    { count: 'id', as: 'total_pipelines' },
    { count: ['cteam', 'csource'], as: 'unique_groups' } // COUNT DISTINCT multi-colonnes
  ],
  where: { csource: 'web' }
});
```

#### 2. Agrégations conditionnelles (Indicateurs KPIs Actifs / Inactifs)

En passant un objet à l'attribut count, l'ORM structure automatiquement une clause conditionnelle CASE WHEN. Cela vous permet de ventiler différents compteurs de statuts en une seule et unique requête vers la base de données :

```js
const { ProjectPipeline } = require("./models");

const ppiStats = await ProjectPipeline.find({
  select: [
    { count: { deletedAt: null }, as: 'active' },          // Compte les lignes où deletedAt = NULL
    { count: { status: 'SUCCESS' }, as: 'total_success' }   // Compte les lignes où status = 'SUCCESS'
  ],
  where: {
    source: 'jenkins',
    team: 'GROUP-1'
  }
});

// Format du tableau de sortie retourné : [{ active: 6, total_success: 42 }]
```

#### 3. Jointures de tables, groupement temporel et tri multi-colonnes

Une orchestration de requête avancée combinant une jointure gauche (LEFT JOIN), des conversions de formats de date et des tris :

```js
const { ProjectPipeline } = require("./models");

const history = await ProjectPipeline.find({
  select: [
    { col: 'Projects.name', as: 'project_name' },
    { dateFormat: ['MyTable.created_at', '%Y-%m'], as: 'period' },
    { count: 'MyTable.id', as: 'pipelines_count' }
  ],
  where: "MyTable.deletedAt IS NULL", // Les chaînes de conditions brutes sont autorisées
  join: {
    table: 'Projects',
    on: 'MyTable.project_id = Projects.id',
    type: 'LEFT'
  },
  groupBy: ['project_name', 'period'],
  orderBy: [
    { field: 'period', direction: 'DESC' },
    { field: 'project_name', direction: 'ASC' }
  ],
  limit: 50
});
```

## Fonction count

Compte le nombre d'enregistrements correspondant au filtre donné.

- **Parameters** `filter` *(Object)* Les critères de filtrage de la requête. Il doit s'agir d'un objet dont les clés sont les noms des colonnes et les valeurs sont les valeurs de filtrage.
- **Returns** `Promise<ModelInstance|number>` - Une promesse qui se résout en une instance `ModelInstance` si un enregistrement est trouvé, ou en `0` si aucun enregistrement ne correspond au filtre.

## Exemple count

```js
const User = require("user");

await User.count({
  id: id
})
```

## Fonction customRequest

La fonction customRequest vous permet d'exécuter des requêtes SQL non prises en charge par sql-connector ; cela peut concerner des requêtes utilisant des mots-clés qui ne sont pas encore implémentés.

- **Parameters** `custom` *(string)*  La requête SQL personnalisée à exécuter.
- **Returns** `Promise<void>` Valeur retournée
- **Throws** `Error` Lève une erreur si l'exécution de la requête échoue.

## Exemple customRequest

```js
const User = require("user");

await User.customRequest("SELECT id, email, status
  FROM users
  WHERE status IN ('active', 'pending')
  AND email LIKE '%gmail.com';")
```

## Fonction delete

Supprime de la table SQL une entrée correspondant au filtre fourni.

- **Parameters** `filter` *(Object)* Un objet représentant les conditions de filtrage pour la suppression.
- **Returns** `Promise<number>` Une promesse qui se résout à 0 si aucune ligne n'a été supprimée, ou à une instance de modèle représentant la ligne supprimée.
- **Throws** `Error` Une promesse qui se résout à 0 si aucune ligne n'a été supprimée, ou à une instance de modèle représentant la ligne supprimée.

## Exemple delete

```js
const User = require("user");

await User.delete({
  email: my@gmail.com
})
```

## Fonction dropTable

Supprime de manière asynchrone une table si elle existe dans la base de données.

Cette fonction construit une requête SQL pour supprimer la table dont le nom est spécifié par la propriété `this.name`. Elle exécute ensuite la requête en utilisant une approche basée sur les promesses.
Si la requête aboutit, le résultat est consigné dans la console.

En cas d'erreur lors de l'exécution de la requête, un message d'erreur est consigné.

- **Returns** `Promise<void>` Une promesse qui se résout une fois l'exécution de la requête terminée.

## Example dropTable

```js
const User = require("user");

await User.dropTable();
```

## generate_uuid function

Génère un UUID unique pour le modèle actuel.

Cette fonction génère un UUID à l'aide de la fonction `UUID()` de SQL_request et vérifie si cet UUID existe déjà dans la base de données pour le modèle actuel. Si l'UUID est unique, il est renvoyé.

Sinon, la fonction renvoie `null`.

- **Parameters** `string` var_uuid Par defaut il vaut uuid
- **Returns** `Promise<string|null>` Une promesse qui se résout en une chaîne UUID unique en cas de succès, ou en `null` si une erreur survient ou si l'UUID n'est pas unique.
- **Throws** `Error` S'il y a une erreur lors de l'exécution de la requête SQL_request.

## Example generate_uuid

```js
const User = require("user");

const uuid = await User.generate_uuid();
const my_uuid = await User.generate_uuid("my_uuid");

await User.save{ email: "user@example.com", status: "active", uuid: uuid, my_uuid: my_uuid }
```

## Instances de modèle

`ModelInstance` représente une ligne déjà chargée depuis la base.

- `updateOne(model)` met à jour la ligne
- `delete(model)` supprime la ligne avec un filtre
- `deleteOne()` supprime la ligne de l'instance
- `customRequest(custom)` exécute une requête personnalisée

```javascript
const userInstance = new ModelInstance('users', { email: 'user@example.com' });

await userInstance.updateOne({ status: 'inactive' });
await userInstance.deleteOne();
```

## Types SQL

`sqlTypeMap` expose les types SQL les plus courants.

```javascript
console.log(sqlTypeMap.String); // "VARCHAR"
```

## Client

`client` est un objet partagé pensé pour centraliser des fonctions applicatives réutilisables.

```javascript
module.exports = client => {
  client.checkServer = () => {
    if (server.isLaunch()) {
      return 1;
    }

    return 0;
  };
};
```

## Résumé

sql-connector fournit une couche simple pour connecter une base MySQL, décrire des schémas, synchroniser les tables et manipuler les données avec des modèles typés.
