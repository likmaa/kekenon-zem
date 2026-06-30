/**
 * withNativeDebugSymbols.js
 *
 * Expo config plugin : ajoute `ndk { debugSymbolLevel 'FULL' }` au buildType
 * release de android/app/build.gradle.
 *
 * Effet : l'AAB de production embarque les symboles de débogage natifs des
 * bibliothèques `.so` (Hermes, React Native, Reanimated…). Sans eux, les crashs
 * natifs (C++) remontent illisibles dans la Play Console et dans Sentry.
 * Résout la recommandation Play « ajouter un fichier de désobfuscation /
 * symboles de débogage natifs ». Non bloquant, purement diagnostic.
 *
 * Idempotent : ne réinjecte pas si `debugSymbolLevel` est déjà présent.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withNativeDebugSymbols(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }
    let contents = config.modResults.contents;
    if (contents.includes('debugSymbolLevel')) {
      return config;
    }
    // Insère le bloc ndk juste après l'accolade ouvrante de buildTypes.release
    contents = contents.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{)/m,
      `$1\n            // withNativeDebugSymbols — symboles natifs FULL pour crashs lisibles\n            ndk { debugSymbolLevel 'FULL' }`
    );
    config.modResults.contents = contents;
    return config;
  });
};
