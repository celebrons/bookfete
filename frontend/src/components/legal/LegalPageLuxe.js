// Page de contenu legal generique (Mentions legales / CGV / Confidentialite)
// — une seule mise en page prose, coherente avec le reste du site
// (container-luxe, tokens de luxe-theme.css), pour ne pas reinventer un
// habillage par page. `sections` = [{ heading, paragraphs?: [string],
// list?: [string] }]. Une valeur contenant "[À COMPLÉTER" recoit un
// traitement visuel distinct (voir ChampACompleter) plutot que de se fondre
// dans le texte comme si elle etait definitive.
import React from 'react';
import '../../styles/luxe-theme.css';
import './LegalPageLuxe.css';

const MARQUEUR = '[À COMPLÉTER';

function ChampACompleter({ texte }) {
  const idx = texte.indexOf(MARQUEUR);
  if (idx === -1) return texte;
  const avant = texte.slice(0, idx);
  const fin = texte.indexOf(']', idx);
  const dedans = fin === -1 ? texte.slice(idx + 1) : texte.slice(idx + 1, fin);
  const apres = fin === -1 ? '' : texte.slice(fin + 1);
  return (
    <>
      {avant}
      <span className="legal-a-completer">{dedans.replace(/^À COMPLÉTER\s*:?\s*/, '')}</span>
      {apres}
    </>
  );
}

function LegalPageLuxe({ title, updated, intro, sections }) {
  return (
    <div className="legal-page">
      <div className="container-luxe legal-page-inner">
        <span className="label-gold">CÉLÉBRONS</span>
        <h1>{title}</h1>
        {updated && <p className="legal-updated">Dernière mise à jour : {updated}</p>}
        {intro && <p className="legal-intro">{intro}</p>}

        {sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h2>{section.heading}</h2>
            {(section.paragraphs || []).map((paragraphe, i) => (
              <p key={i}><ChampACompleter texte={paragraphe} /></p>
            ))}
            {section.list && (
              <ul>
                {section.list.map((ligne, i) => (
                  <li key={i}><ChampACompleter texte={ligne} /></li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export default LegalPageLuxe;
