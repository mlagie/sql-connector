# @mlagie/sql-connector — Documentation française

[![npm version](https://img.shields.io/npm/v/%40mlagie%2Fsql-connector)](https://www.npmjs.com/package/@mlagie/sql-connector)

Couche SQL légère et orientée dialecte pour **MySQL** et **PostgreSQL**.

`@mlagie/sql-connector` fournit :

- gestion des connexions ;
- schémas déclaratifs ;
- types SQL et alias de types ;
- modèles CRUD ;
- conditions structurées `WHERE` / `HAVING` ;
- `IN`, `BETWEEN`, `LIKE`, `ILIKE`, `NULL`, `AND`, `OR`, `NOT` ;
- agrégations, groupements, tris et jointures ;
- gestion des dépendances de clés étrangères ;
- synchronisation des schémas ;
- planification et exécution des migrations ;
- checksum, fichiers de migration chiffrés et sauvegardes chiffrées optionnelles ;
- déclarations TypeScript.

> **SGBD supportés :** MySQL et PostgreSQL.

**Documentation :** [English](../../README.md) · Français

---

## Sommaire

1. [Installation](#installation)
2. [Démarrage rapide](#démarrage-rapide)
3. [Connexion](#connexion)
4. [Schémas](#schémas)
   - [Propriétés d'un champ](#propriétés-dun-champ)
   - [Types](#types)
   - [Valeurs par défaut](#valeurs-par-défaut)
   - [Contraintes](#contraintes)
   - [Clés étrangères](#clés-étrangères)
5. [Modèles](#modèles)
6. [Conditions](#conditions)
7. [Select, agrégations, groupement et tri](#select-agrégations-groupement-et-tri)
8. [Jointures](#jointures)
9. [Synchronisation](#synchronisation)
10. [Instances de modèle](#instances-de-modèle)
11. [Migrations](#migrations)
    - [Migration workflow](#migration-workflow)
    - [Migration options](#migration-options)
    - [Migration opérations](#migration-opérations)
    - [Migration renommage](#migration-renommage)
    - [Changement destructifs](#changements-destructifs)
    - [Checksum et historique](#checksum-et-historique)
    - [Chriffrement](#chiffrement)
    - [Sauvegardes](#sauvegardes)
    - [Statut et nettoyage](#statut-et-nettoyage)
12. [TypeScript](#typescript)
13. [Sécurité SQL](#sécurité-sql)
14. [API exportée](#api-exportée)
15. [Tests](#tests)
16. [Documentation détaillée](#documentation-détaillée)
17. [Licence](#licence)

---

## Installation

```bash
npm install @mlagie/sql-connector
```

---

## Démarrage rapide

```js
const {
  Schema,
  Model,
  connect,
  logout,
} = require('@mlagie/sql-connector');

await connect({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydatabase',
});

const userSchema = new Schema({
  id: {
    type: Number,
    auto_increment: true,
    primary_key: true,
  },
  email: {
    type: String,
    length: 255,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending',
  },
});

const User = new Model('users', userSchema);

await Model.syncAllTables();
await User.save({ email: 'user@example.com', status: 'active' });

const users = await User.find({
  where: {
    status: { IN: ['active', 'pending'] },
  },
});

await logout();
```

---

## Connexion

### MySQL

MySQL est le dialecte par défaut.

```js
await connect({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'mydatabase',
});
```

### PostgreSQL

```js
await connect({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'mydatabase',
}, 'postgres');
```

### Fermer la connexion

```js
await logout();
```

---

## Schémas

```js
const schema = new Schema({
  name: { type: String, length: 120, required: true },
  age: { type: Number },
  active: { type: Boolean, default: true },
});
```

### Propriétés d'un champ

| Propriété | Type | Description |
|---|---|---|
| `type` | constructeur / chaîne / `{ name }` | Type du champ. |
| `length` | `number` | Longueur du type. |
| `precision` | `number` | Précision décimale. |
| `scale` | `number` | Échelle décimale. |
| `required` | `boolean` | Ajoute `NOT NULL`. |
| `default` | quelconque | Valeur SQL par défaut. |
| `unique` | `boolean` | Ajoute `UNIQUE`. |
| `primary_key` | `boolean` | Ajoute `PRIMARY KEY`. |
| `auto_increment` | `boolean` | Auto-incrément / identity selon le dialecte. |
| `enum` | `string[]` | Valeurs autorisées. |
| `foreignKey` | `string` | Référence comme `users(id)` ou `users.id`. |
| `oldname` | `string` | Ancien nom utilisé explicitement par les migrations. |
| `customize` | `string` | SQL additionnel de définition. |

### Types

| Alias | SQL |
|---|---|
| `String` | `VARCHAR` |
| `Char` | `CHAR` |
| `Number` | `INT` |
| `SmallInt` | `SMALLINT` |
| `BigInt` | `BIGINT` |
| `Decimal` | `DECIMAL` |
| `Boolean` | `BOOLEAN` |
| `Date` | `DATETIME` |
| `DateTime` | `DATETIME` |
| `Timestamp` | `TIMESTAMP` |
| `Float` | `FLOAT` |
| `Double` | `DOUBLE` |
| `Text` | `TEXT` |
| `Blob` | `BLOB` |
| `Binary` | `VARBINARY` |
| `Uuid` | `CHAR` |
| `Object` | `JSON` |
| `Array` | `VARCHAR` |
| `Now` | `NOW()` |
| `CurrentTimestamp` | `CURRENT_TIMESTAMP` |

Les constructeurs JavaScript `String`, `Number`, `Boolean`, `Date`, `Object` et `Array` sont également acceptés. `Now` et `CurrentTimestamp` représentent des expressions/constantes SQL temporelles et sont surtout destinés aux valeurs par défaut, pas à des types de stockage portables.

### Valeurs par défaut

```js
const schema = new Schema({
  active: { type: Boolean, default: true },
  retries: { type: Number, default: 0 },
  note: { type: String, default: 'pending' },
  created_at: { type: Date, default: 'CURRENT_TIMESTAMP' },
  metadata: { type: Object, default: { source: 'api' } },
});
```

Les valeurs par défaut peuvent être `null`, chaînes, nombres, booléens, `Date`, objets, expressions temporelles SQL ou fonctions retournant une valeur supportée.

```js
created_at: {
  type: Date,
  default: sqlTypeMap.CurrentTimestamp,
}
```

### Contraintes

Le module prend en charge `NOT NULL`, `UNIQUE`, `PRIMARY KEY`, `FOREIGN KEY`, `DEFAULT`, `ENUM`, l'auto-incrément et `customize`.

Ne combinez pas `primary_key: true` et `unique: true`.

### Clés étrangères

```js
const orderSchema = new Schema({
  user_id: { type: Number, foreignKey: 'users(id)' },
  product_id: { type: Number, foreignKey: 'products.id' },
});
```

`Model.syncAllTables()` respecte l'ordre des dépendances et rejette les cycles.

---

## Modèles

```js
const User = new Model('users', userSchema);
```

Méthodes principales :

- `save(data)` — insertion ;
- `find(options)` — recherche structurée ;
- `count(filter)` — comptage ;
- `delete(filter)` — suppression ;
- `dropTable()` — suppression de table ;
- `generate_uuid(column?)` — génération d'UUID ;
- `customRequest(sql)` — SQL brut de confiance.

Exemple :

```js
const users = await User.find({
  select: ['id', 'email'],
  where: {
    status: { IN: ['active', 'pending'] },
  },
  orderBy: [
    { field: 'email', direction: 'ASC' },
  ],
  limit: 50,
  offset: 0,
});
```

---

## Conditions

Les `where` et `having` utilisent des objets structurés. Les chaînes SQL brutes sont refusées par le builder.

### Valeur simple

```js
{ status: 'active' }
```

### Opérateurs

Les opérateurs supportés sont :

```text
=
!=
>
<
>=
<=
LIKE
NOT LIKE
ILIKE
NOT ILIKE
IN
NOT IN
BETWEEN
NOT BETWEEN
```

Exemples :

```js
{ age: { '>=': 18 } }
{ email: { LIKE: '%@example.com' } }
{ status: { IN: ['active', 'pending'] } }
{ age: { BETWEEN: [18, 65] } }
```

### NULL

```js
{ deleted_at: null }
{ deleted_at: { '=': null } }
{ deleted_at: { '!=': null } }
```

Ces formes deviennent `IS NULL` / `IS NOT NULL`.

### AND / OR / NOT

```js
{
  AND: [
    { active: true },
    {
      OR: [
        { role: 'admin' },
        { role: 'moderator' },
      ],
    },
  ],
}
```

```js
{
  NOT: {
    status: { IN: ['deleted', 'blocked'] },
  },
}
```

Les tableaux `AND` / `OR` vides et les valeurs invalides de `NOT` sont refusés.

---

## Select, agrégations, groupement et tri

Le `select` accepte des chaînes ou des objets structurés :

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
    { sum: 'amount', as: 'revenue' },
  ],
  where: {
    active: true,
  },
});
```

### Groupement avec `GROUP BY`

`groupBy` est une option de `find()` et permet de regrouper les lignes avant l'application de `having`.

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
  ],
  groupBy: ['status'],
});
```

Les éléments de `groupBy` peuvent être des colonnes ou des expressions structurées comme `dateFormat`.

### Filtrer les groupes avec `HAVING`

`having` filtre le résultat **après** le `GROUP BY` et utilise le même format de conditions structurées que `where` :

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
  ],
  groupBy: ['status'],
  having: {
    total: { '>': 10 },
  },
});
```

Les chaînes SQL brutes dans `having` sont refusées.

### Tri avec `ORDER BY`

`orderBy` permet de trier le résultat final. Il accepte des colonnes ou des alias de sélection, avec une direction `ASC` ou `DESC` :

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
  ],
  groupBy: ['status'],
  having: {
    total: { '>': 10 },
  },
  orderBy: [
    { field: 'total', direction: 'DESC' },
    { field: 'status', direction: 'ASC' },
  ],
});
```

### Exemple complet

Toutes les clauses peuvent être combinées dans une seule requête :

```js
const stats = await User.find({
  select: [
    'status',
    { count: 'id', as: 'total' },
    { sum: 'amount', as: 'revenue' },
  ],
  where: {
    active: true,
  },
  groupBy: ['status'],
  having: {
    total: { '>': 10 },
  },
  orderBy: [
    { field: 'total', direction: 'DESC' },
  ],
});
```

Ce flux correspond à `SELECT` → `WHERE` → `GROUP BY` → `HAVING` → `ORDER BY`. Les valeurs de `where` et `having` sont paramétrées par le Connector.

---

## Jointures

La couche `Model.find()` génère actuellement une `INNER JOIN` à partir de `table` et `on` :

```js
join: {
  table: 'profiles',
  on: 'users.id = profiles.user_id',
}
```

L'expression `on` doit être considérée comme du SQL de confiance.

---

## Synchronisation

```js
await Model.syncAllTables();
```

La synchronisation crée les tables dans l'ordre des dépendances de clés étrangères et détecte les cycles.

Pour les évolutions contrôlées du schéma, utilisez les migrations.

---

## Instances de modèle

```js
const [user] = await User.find({
  where: { email: 'user@example.com' },
});

await user.updateOne({ status: 'inactive' });
await user.delete();
```

Méthodes : `updateOne`, `delete`, `customRequest`, `getRecordData`, `toJSON`.

---

## Migrations

Le système de migration compare les modèles souhaités au schéma réellement présent dans la base, produit un plan puis génère le SQL adapté au dialecte.

```js
const {
  Migration,
  MigrationPlan,
  MigrationStore,
  MigrationRunner,
  SchemaDiffer,
  SchemaInspector,
} = require('@mlagie/sql-connector');
```

### Migration Workflow

```js
const migration = new Migration({
  encryptionKey: process.env.SQL_CONNECTOR_MIGRATION_KEY,
});

const plan = await migration.plan({
  name: 'users-schema',
});

console.log(plan.toJSON());

if (plan.hasChanges()) {
  plan.approve();
  await plan.execute();
}
```

Ou directement :

```js
await Migration.migrate({
  name: 'users-schema',
  encryptionKey: process.env.SQL_CONNECTOR_MIGRATION_KEY,
});
```

### Migration Options

| Option | Description |
|---|---|
| `connection` | Connexion existante. |
| `dialect` | `mysql`, `postgres` ou instance de dialecte. |
| `models` | Modèles à comparer. |
| `directory` | Dossier des migrations. |
| `backupDirectory` | Dossier des sauvegardes. |
| `encryptionKey` | Clé de chiffrement. |
| `retention` | Durée de conservation (`ms`, `s`, `m`, `h`, `d`, `w`). |
| `allowDestructiveChanges` | Autorise les suppressions de colonnes. |
| `allowDropTables` | Autorise les suppressions de tables. |

### Migration Opérations

Le diff peut générer :

- `createTable` ;
- `addColumn` ;
- `renameColumn` ;
- `alterColumn` ;
- `dropColumn` — destructif ;
- `dropTable` — destructif.

### Migration Renommage

Le renommage doit être explicite avec `oldname` :

```js
email_address: {
  type: String,
  length: 320,
  oldname: 'email',
}
```

### Changements destructifs

Par défaut, la suppression d'une colonne ou d'une table est bloquée.

```js
const plan = await migration.plan({
  allowDestructiveChanges: true,
  allowDropTables: true,
});

plan.approve();
await plan.execute({
  allowDestructiveChanges: true,
});
```

L'approbation et l'autorisation destructive sont deux protections distinctes.

### Checksum et historique

Le runner crée `sql_connector_migrations` et enregistre l'identifiant, le checksum SHA-256 et les dates d'application/création.

Un identifiant déjà appliqué avec un checksum différent provoque une erreur.

### Chiffrement

Les migrations sont écrites en `.sql.enc`.

```bash
export SQL_CONNECTOR_MIGRATION_KEY='un-secret-long-et-aleatoire'
```

Le format utilise AES-256-GCM et une clé dérivée.

### Sauvegardes

Avec `retention`, les tables affectées sont sauvegardées avant la migration dans des fichiers JSON chiffrés.

```js
new Migration({
  encryptionKey: process.env.SQL_CONNECTOR_MIGRATION_KEY,
  retention: '30d',
});
```

La sauvegarde est un snapshot de données et ne constitue pas un rollback automatique.

### Statut et nettoyage

```js
const migration = new Migration();
const status = await migration.status();
console.table(status);

await migration.cleanup();
```

---

## TypeScript

Le package fournit `index.d.ts` avec les types de schéma, conditions, requêtes, modèles et migrations.

```ts
import {
  Schema,
  Model,
  Migration,
  InferSchema,
} from '@mlagie/sql-connector';
```

---

## Sécurité SQL

Le builder structuré sépare les identifiants SQL des valeurs :

- valeurs `WHERE` paramétrées ;
- valeurs `HAVING` paramétrées ;
- éléments de `IN` / `NOT IN` paramétrés ;
- bornes de `BETWEEN` paramétrées ;
- placeholders PostgreSQL numérotés ;
- échappement des identifiants ;
- refus des `WHERE` / `HAVING` sous forme de chaînes brutes.

`customRequest()` reste volontairement une porte d'accès au SQL brut et doit recevoir uniquement du SQL de confiance.

---

## API exportée

```text
client
connect
logout
Schema
Model
ModelInstance
sqlTypeMap
Migration
MigrationPlan
MigrationStore
MigrationRunner
SchemaDiffer
SchemaInspector
MySQLDialect
PostgreSQLDialect
```

---

## Tests

```bash
npm install
npm test
npm run test:coverage
npm run security
```

---

## Documentation détaillée

- [Index de documentation](../README.md)
- [Schéma](../SCHEMA.md)
- [Conditions et requêtes](../QUERY.md)
- [Migrations](../MIGRATIONS.md)
- [API](../API.md)
- [Dialectes](../DIALECTS.md)
- [Contribution](../../CONTRIBUTING.md)
- [Sécurité](../../SECURITY.md)

## Licence

MIT — voir [LICENSE](../../LICENSE).
