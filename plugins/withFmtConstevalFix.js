/**
 * withFmtConstevalFix.js
 *
 * Corrige l'échec de build iOS sur Xcode récent :
 *   "call to consteval function 'fmt::basic_format_string<...>' is not a constant expression"
 *
 * La lib `fmt` (utilisée par RCT-Folly / React core) construit ses format-strings
 * en `consteval`. Les Clang récents (Xcode 16.3+) refusent ces évaluations.
 * On désactive le chemin consteval de fmt via le define `FMT_HAS_CONSTEVAL=0`
 * sur toutes les cibles Pods → fmt repasse sur la vérification runtime.
 *
 * Injecté dans le post_install du Podfile pendant le prebuild EAS. Idempotent.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');

      if (contents.includes('FMT_HAS_CONSTEVAL')) {
        return cfg;
      }

      const injection = [
        '',
        '    # withFmtConstevalFix — corrige fmt consteval sur Xcode récent',
        '    installer.pods_project.targets.each do |t|',
        '      t.build_configurations.each do |bc|',
        "        bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']",
        "        bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_HAS_CONSTEVAL=0'",
        '      end',
        '    end',
        '',
      ].join('\n');

      contents = contents.replace(
        /(post_install do \|installer\|)/,
        `$1\n${injection}`
      );

      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
