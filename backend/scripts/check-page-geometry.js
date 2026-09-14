// Verifie qu'AUCUNE mise en page ne deborde de sa page, dans AUCUN format.
//
// Pourquoi ce script existe : le rendu est du CSS, et une page peut etre
// parfaite en Standard et cassee en Luxe sans qu'aucun test unitaire ne le
// voie — ceux-ci comparent des chaines HTML, pas des pixels. C'est exactement
// ce qui s'est produit le 2026-09-14 : en Luxe (espacement x1,55), les deux
// photos de "2 photos et un texte" ne tenaient plus cote a cote, passaient a
// la ligne, et le bloc debordait de 31 px en haut ET en bas. Signale par
// l'utilisateur, invisible pour la suite de tests.
//
// Ce script ouvre le VRAI rendu (le meme HTML que le PDF envoye a
// l'imprimeur, voir pdfService.js) dans un navigateur, et mesure.
//
//   node scripts/check-page-geometry.js
//   node scripts/check-page-geometry.js --format luxe
//
// Sortie : une ligne par (mise en page x format), code de sortie non nul au
// premier debordement.

const puppeteer = require('puppeteer');
const { renderBookHtml } = require('../services/composition/pageRenderer');
const { resolveCoverFormat } = require('../services/composition/coverFormat');
const { resolveFormatDensity } = require('../services/composition/formatDensity');

const FORMATS = ['livret', 'standard', 'luxe'];
const argFormat = (process.argv.find((a) => a.startsWith('--format')) || '').split('=')[1]
  || (process.argv.includes('--format') ? process.argv[process.argv.indexOf('--format') + 1] : null);
const formatsATester = argFormat ? [argFormat] : FORMATS;

// Miroir du catalogue de l'atelier (frontend atelierLayouts.js). Duplique
// volontairement, comme les autres petites tables partagees de ce projet :
// ce script doit pouvoir tourner sans le frontend.
const LAYOUTS = [
  { slug: 'FULL_PHOTO', kind: 'photo', slots: ['photo'] },
  { slug: 'FULL_PHOTO_SPREAD', kind: 'photo', slots: ['photo'] },
  { slug: 'TWO_PHOTOS', kind: 'photo', slots: ['photo', 'photo'] },
  { slug: 'TWO_PHOTOS_STACKED', kind: 'photo', slots: ['photo', 'photo'] },
  { slug: 'THREE_PHOTOS', kind: 'photo', slots: ['photo', 'photo', 'photo'] },
  { slug: 'FOUR_PHOTOS', kind: 'photo', slots: ['photo', 'photo', 'photo', 'photo'] },
  { slug: 'PHOTO_TEXT', kind: 'mixte', slots: ['photo', 'text'] },
  { slug: 'TEXT_PHOTO', kind: 'mixte', slots: ['text', 'photo'] },
  { slug: 'PHOTO_WITH_CAPTION', kind: 'mixte', slots: ['photo', 'text'] },
  { slug: 'TWO_PHOTOS_TEXT', kind: 'mixte', slots: ['photo', 'photo', 'text'] },
  { slug: 'ONE_TESTIMONY', kind: 'texte', slots: ['text'] },
  { slug: 'TWO_TESTIMONIES', kind: 'texte', slots: ['text', 'text'] },
  { slug: 'THREE_TESTIMONIES', kind: 'texte', slots: ['text', 'text', 'text'] },
  { slug: 'TITLE_TEXT', kind: 'mixte', slots: ['title', 'text'] },
  { slug: 'TITLE_TWO_PHOTOS', kind: 'mixte', slots: ['title', 'photo', 'photo'] },
  { slug: 'TITLE_FOUR_PHOTOS', kind: 'mixte', slots: ['title', 'photo', 'photo', 'photo', 'photo'] }
];

// Texte DELIBEREMENT long : un debordement se revele sur un cas defavorable,
// pas sur trois mots. L'auto-ajustement typographique doit justement le
// ramener dans son cadre (typographySystem.js) — si la page deborde quand
// meme, c'est un vrai defaut.
const TEXTE_LONG = "C'etait un dimanche de juin, la maison etait pleine, et personne "
  + "n'avait envie que la journee se termine. On a ri jusqu'a la nuit tombee, "
  + "puis on a ressorti les vieilles photos, et tout le monde s'est mis a parler "
  + "en meme temps. Je crois que je n'ai jamais vu mon pere aussi heureux.";

function pagePour(layout) {
  const items = [];
  const itemIds = [];
  layout.slots.forEach((slot, index) => {
    const id = `${layout.slug}-${index}`;
    itemIds.push(id);
    if (slot === 'photo') {
      items.push({ id, kind: 'photo', url: 'https://placehold.co/1600x1200.png' });
    } else {
      items.push({ id, kind: 'texte', text: slot === 'title' ? 'Les soixante ans de Jean' : TEXTE_LONG });
    }
  });
  const kind = layout.kind === 'texte' ? 'texte' : layout.kind;
  return {
    items,
    page: {
      page_index: 0,
      layout_id: layout.slug,
      content: { kind, blocks: [{ kind, layoutId: layout.slug, itemIds }] }
    }
  };
}

let echecs = 0;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const formatId of formatsATester) {
    const format = { formatId, ...resolveCoverFormat(formatId), ...resolveFormatDensity(formatId) };
    console.log(`\n=== ${formatId} (${format.trimWidthMm}x${format.trimHeightMm} mm) ===`);

    for (const layout of LAYOUTS) {
      const { items, page: pageData } = pagePour(layout);
      const html = renderBookHtml({
        book: { title: 'controle geometrie' },
        items,
        layouts: [{ id: layout.slug, slug: layout.slug, kind: layout.kind }],
        pages: [pageData],
        format
      });

      // eslint-disable-next-line no-await-in-loop
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      // eslint-disable-next-line no-await-in-loop
      const m = await page.evaluate(() => {
        const section = document.querySelector('.page');
        const blocks = document.querySelector('.page-blocks');
        if (!section || !blocks) return null;
        const cadre = blocks.getBoundingClientRect();
        // Tout ce qui est reellement dessine dans la page : un enfant qui sort
        // du cadre de contenu, c'est de l'encre hors de la zone sure.
        let pireHaut = 0;
        let pireBas = 0;
        let pireCote = 0;
        blocks.querySelectorAll('*').forEach((el) => {
          // Une photo etalee sur la double page sort du cadre PAR CONSTRUCTION
          // (plein bord, voir .photo-spread) : ce n'est pas un defaut.
          if (el.closest('.photo-spread')) return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          pireHaut = Math.max(pireHaut, cadre.top - r.top);
          pireBas = Math.max(pireBas, r.bottom - cadre.bottom);
          pireCote = Math.max(pireCote, cadre.left - r.left, r.right - cadre.right);
        });
        return {
          debordementInterne: blocks.scrollHeight - blocks.clientHeight,
          debordementPage: section.scrollHeight - section.clientHeight,
          haut: Math.round(pireHaut),
          bas: Math.round(pireBas),
          cote: Math.round(pireCote)
        };
      });

      // 1 px de tolerance : les arrondis sous-pixel du navigateur ne sont pas
      // un defaut de mise en page.
      const ok = m && m.debordementInterne <= 1 && m.debordementPage <= 1
        && m.haut <= 1 && m.bas <= 1 && m.cote <= 1;
      if (!ok) echecs += 1;
      const detail = m
        ? `haut ${m.haut}px, bas ${m.bas}px, cotes ${m.cote}px, defilement ${m.debordementInterne}px`
        : 'page non rendue';
      console.log(`${ok ? '  OK  ' : ' ECHEC'} ${layout.slug.padEnd(20)} ${ok ? '' : detail}`);
    }
  }

  await browser.close();
  console.log(echecs === 0
    ? '\nRESULTAT : OK — aucune page ne deborde'
    : `\nRESULTAT : ${echecs} mise(s) en page en debordement`);
  process.exit(echecs === 0 ? 0 : 1);
})().catch((error) => { console.error('ERREUR', error.message); process.exit(1); });
