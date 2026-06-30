/**
 * withOnResumeGuard.js
 *
 * Expo config plugin qui ajoute un try-catch autour de onResume() dans
 * MainActivity.kt pour empêcher le crash :
 *   RuntimeException: Unable to resume activity
 *   Caused by: IndexOutOfBoundsException: Index 0 out of bounds for length 0
 *              at ArrayList.remove (Mapbox / expo-location lifecycle listener)
 *
 * Racine : expo-modules-core 2.2.x ReactActivityDelegateWrapper essaie de
 * supprimer un écouteur d'une liste déjà vide (double-remove race condition).
 * Le catch est sûr car la notification de lifecycle a déjà eu lieu — on perd
 * seulement la deuxième suppression inutile.
 */
const { withMainActivity } = require('@expo/config-plugins');

module.exports = function withOnResumeGuard(config) {
  return withMainActivity(config, (config) => {
    let contents = config.modResults.contents;

    // Ne pas appliquer deux fois
    if (contents.includes('// withOnResumeGuard')) {
      return config;
    }

    if (config.modResults.language === 'kt') {
      // Ajouter l'import Log si absent
      if (!contents.includes('import android.util.Log')) {
        contents = contents.replace(
          /^(import com\.facebook\.react\.ReactActivity)/m,
          'import android.util.Log\n$1'
        );
      }

      // Injecter l'override onResume après l'accolade ouvrante de MainActivity
      contents = contents.replace(
        /^(class MainActivity[^\n]*\{)/m,
        `$1\n\n  // withOnResumeGuard — prevent IndexOutOfBoundsException in ReactActivityDelegateWrapper\n  override fun onResume() {\n    try {\n      super.onResume()\n    } catch (e: IndexOutOfBoundsException) {\n      Log.e("MainActivity", "onResume: caught IndexOutOfBoundsException in delegate wrapper, recovering gracefully", e)\n    }\n  }\n`
      );
    } else {
      // Java fallback (cas rare avec Expo 52)
      if (!contents.includes('import android.util.Log')) {
        contents = contents.replace(
          /^(import com\.facebook\.react\.ReactActivity;)/m,
          'import android.util.Log;\n$1'
        );
      }

      contents = contents.replace(
        /^(public class MainActivity[^\n]*\{)/m,
        `$1\n\n  // withOnResumeGuard — prevent IndexOutOfBoundsException in ReactActivityDelegateWrapper\n  @Override\n  protected void onResume() {\n    try {\n      super.onResume();\n    } catch (IndexOutOfBoundsException e) {\n      Log.e("MainActivity", "onResume: caught IndexOutOfBoundsException in delegate wrapper, recovering gracefully", e);\n    }\n  }\n`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};
