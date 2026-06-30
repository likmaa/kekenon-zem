#!/bin/bash

# Script d'aide pour générer le build native (APK/AAB) pour l'App Driver

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Assistant de Build Transport App (DRIVER) ===${NC}"

# 1. Vérifier EAS CLI
if ! command -v eas &> /dev/null
then
    echo "EAS CLI n'est pas installé. Installation en cours..."
    npm install -g eas-cli
fi

# 2. Vérifier la connexion
echo -e "${BLUE}Vérification de la connexion à Expo...${NC}"
eas whoami || (echo "Veuillez vous connecter à Expo d'abord :" && eas login)

# 3. Choisir le format de sortie
echo -e "\n${BLUE}Quel format de build voulez-vous ?${NC}"
echo "1) APK (pour tests internes)"
echo "2) AAB (pour Google Play Store)"
read -p "Votre choix (1/2) : " format_type

if [ "$format_type" == "2" ]; then
    BUILD_PROFILE="production"
    FORMAT_NAME="AAB"
else
    BUILD_PROFILE="preview"
    FORMAT_NAME="APK"
fi

# 4. Choisir le type de build
echo -e "\n${BLUE}Où voulez-vous lancer le build ?${NC}"
echo "1) Build Cloud (EAS - limité, nécessite connexion)"
echo "2) Build Local (Utilise votre machine, nécessite SDK Android & Java 17)"
read -p "Votre choix (1/2) : " build_type

# 5. Lancer le build
if [ "$build_type" == "2" ]; then
    echo -e "\n${BLUE}Vérification rapide de l'environnement local...${NC}"
    if ! command -v java &> /dev/null || ! java -version 2>&1 | grep -q "17"; then
        echo -e "${BLUE}Attention: Java 17 n'a pas été détecté ou n'est pas la version par défaut.${NC}"
    fi
    
    echo -e "${GREEN}Lancement du build LOCAL ($FORMAT_NAME)...${NC}"
    eas build --profile $BUILD_PROFILE --platform android --local
else
    echo -e "\n${GREEN}Prêt pour le build EAS Cloud ($FORMAT_NAME) !${NC}"
    echo -e "\n${BLUE}Voulez-vous lancer le build maintenant ? (y/n)${NC}"
    read answer
    if [ "$answer" != "${answer#[Yy]}" ] ;then
        eas build --profile $BUILD_PROFILE --platform android
    else
        echo "Opération annulée."
    fi
fi
