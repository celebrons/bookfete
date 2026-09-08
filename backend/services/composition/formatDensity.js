// backend/services/composition/formatDensity.js
//
// Fait le pont entre un format d'impression (livret/standard/luxe) et les
// deux leviers qui rendent une edition VISIBLEMENT differente d'une autre :
//   - `mood` : biaise le CHOIX de layout pour le contenu non verrouille
//     (voir layoutScoring.MOOD_LAYOUT_WEIGHTS, entrees 'format-livret'/
//     'format-luxe' dediees — jamais 'compact'/'aere', reservees au bouton
//     "essayer une autre ambiance") -> formatComposer.js.
//   - `spaceScale`/`typeScale` : mettent a l'echelle marges/espacements et
//     typographie de CHAQUE page (verrouillee ou non) -> pageRenderer.js,
//     via les CSS custom properties --fmt-space-scale/--fmt-type-scale.
//
// Fonction pure, aucun acces reseau/disque. Seul endroit ou ces valeurs sont
// codees en dur — les ajuster ici uniquement.

const FORMAT_DENSITY = {
  livret: {
    mood: 'format-livret',
    // Ecart volontairement marque (pas juste "un peu moins") par rapport a
    // standard : le format doit se reconnaitre sans avoir a comparer les 3
    // cote a cote (retour utilisateur : l'ecart precedent, 0.75/0.88, restait
    // trop discret pour sauter aux yeux).
    spaceScale: 0.62,
    typeScale: 0.8
  },
  standard: {
    // Neutre par construction : mood absent => scoreMood renvoie 0 partout
    // (voir layoutScoring.js), comportement de composition deja existant et
    // inchange. C'est le format "reference".
    mood: undefined,
    spaceScale: 1,
    typeScale: 1
  },
  luxe: {
    mood: 'format-luxe',
    spaceScale: 1.55,
    typeScale: 1.25
  }
};

const DEFAULT_FORMAT_DENSITY_ID = 'standard';

function resolveFormatDensity(formatId) {
  return FORMAT_DENSITY[formatId] || FORMAT_DENSITY[DEFAULT_FORMAT_DENSITY_ID];
}

module.exports = {
  FORMAT_DENSITY,
  DEFAULT_FORMAT_DENSITY_ID,
  resolveFormatDensity
};
