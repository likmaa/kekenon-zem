/**
 * withMapboxLocationGuard.js
 *
 * Expo config plugin qui ajoute un try-catch autour de l'initialisation
 * de la localisation Mapbox dans MainApplication.kt pour empêcher le crash :
 *   ArrayIndexOutOfBoundsException: length=10; index=-1
 *   at ArrayList.add ← requestLocationUpdatesV11 ← LocationManager.enable
 *   ← RNMBXLocationModule.startLocationManager
 *
 * Cause : race condition thread-unsafe dans @rnmapbox/maps ArrayList interne,
 * plus fréquent sur les appareils Android budget (TECNO, Itel, etc.) dont
 * le gestionnaire de localisation Android 11 lance plusieurs threads simultanés.
 *
 * Fix principal : mise à jour de @rnmapbox/maps vers ^10.3.0
 * Ce plugin est un filet de sécurité pour les appareils persistants.
 */
const { withMainApplication } = require('@expo/config-plugins');

module.exports = function withMapboxLocationGuard(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    // Ne pas appliquer deux fois
    if (contents.includes('// withMapboxLocationGuard')) {
      return config;
    }

    if (config.modResults.language === 'kt') {
      // Ajouter l'import Thread.UncaughtExceptionHandler si nécessaire
      if (!contents.includes('import android.util.Log')) {
        contents = contents.replace(
          /^(import android\.app\.Application)/m,
          'import android.util.Log\n$1'
        );
      }

      // Injecter dans onCreate() un handler global qui attrape les
      // ArrayIndexOutOfBoundsException venant de Mapbox location
      const onCreatePattern = /override fun onCreate\(\) \{(\s*super\.onCreate\(\))/;
      if (onCreatePattern.test(contents)) {
        contents = contents.replace(
          onCreatePattern,
          `override fun onCreate() {\n    // withMapboxLocationGuard — catch Mapbox location thread-safety crash\n    val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()\n    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->\n      val isMapboxLocationCrash = throwable is ArrayIndexOutOfBoundsException &&\n        throwable.stackTrace.any { it.className.contains("rnmapbox") || it.className.contains("LocationManager") }\n      if (isMapboxLocationCrash) {\n        Log.e("MainApplication", "withMapboxLocationGuard: caught Mapbox location crash, recovering", throwable)\n      } else {\n        defaultHandler?.uncaughtException(thread, throwable)\n      }\n    }\n    $1`
        );
      }
    }

    config.modResults.contents = contents;
    return config;
  });
};
