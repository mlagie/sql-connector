#!/bin/bash

# 1. Extraire le nom et la version du ./package.json à l'aide de jq
PACKAGE_NAME=$(jq -r '.name' ./package.json)
LOCAL_VERSION=$(jq -r '.version' ./package.json)

echo "[INFO] Vérification de la version pour $PACKAGE_NAME..."

# 2. Récupérer la dernière version sur npm (redirige les erreurs 404 si le package est nouveau)
REMOTE_VERSION=$(npm view "$PACKAGE_NAME" version 2>/dev/null)

# Si le package n'existe pas encore sur npm
if [ -z "$REMOTE_VERSION" ]; then
    echo "Le package n'a jamais été publié sur npm. Première publication autorisée."
    exit 0
fi

echo "[INFO] Version locale (./package.json) : $LOCAL_VERSION"
echo "[INFO] Dernière version sur npm       : $REMOTE_VERSION"

# 3. Fonction pour comparer les versions sémantiques (SemVer)
# Utilise la commande 'sort -V' (version sort) intégrée sous Linux
function version_gt() {
    # Teste si la version locale est égale à la version la plus haute après un tri "version"
    [ "$1" = "$(echo -e "$1\n$2" | sort -V | tail -n1)" ] && [ "$1" != "$2" ]
}

# 4. Comparaison
if version_gt "$LOCAL_VERSION" "$REMOTE_VERSION"; then
    echo "✅ Succès : La version locale est supérieure. Prêt pour la publication."
    exit 0
else
    echo "❌ Erreur : La version locale ($LOCAL_VERSION) doit être STRICTEMENT supérieure à la version sur npm ($REMOTE_VERSION)."
    echo "👉 Pensez à lancer : npm version patch"
    exit 1 # Fait planter la pipeline GitHub Actions
fi