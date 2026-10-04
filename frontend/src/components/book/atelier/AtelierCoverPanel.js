import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../BookLuxe.css';

// Controle manuel LEGER sur la couverture automatique (coverComposer.js),
// integre directement dans l'atelier (panneau de droite quand on feuillette
// jusqu'a la couverture/4e) — variante allegee de l'ancien
// BookCoverDesignerLuxe.js (qui n'est plus reference depuis la navigation
// principale, voir BookPageLuxe.js) : memes controles de formulaire, memes
// classes CSS .coverlite-*/.cvrmini-* (feuille de style globale, rien a
// deplacer), mais SANS apercu propre — l'atelier a deja son propre apercu
// vivant de la couverture/4e (coverHtml/backCoverHtml dans
// BookAtelierLuxe.js). Pas de FaceTabs/activeFace non plus : la face
// (front/back) est deja determinee par ce que l'utilisateur feuillette,
// passee en prop `face` — meme principe que "naviguer vers une page la
// selectionne pour edition" deja etabli pour les pages interieures.
//
// NE CHOISIT PLUS LA PHOTO (retour utilisateur, 2026-09-26) : uniquement
// templates/parametres desormais — gabarit, couleur, style d'album, textes.
// Le choix de la photo de couverture/4e se fait en cliquant DIRECTEMENT sur
// la page affichee (CoverPhotoOverlay dans AtelierBookView.js, meme fenetre
// de choix — AtelierPhotoPickerModal.js — que pour un emplacement de page
// interieure). Deux raisons : coherence avec les pages, et ce panneau donne
// desormais plus de place aux reglages qui lui restent, une couverture etant
// une page unique (contrairement a une double-page interieure).

const PHRASE_MODES = [
  { id: 'auto' },
  { id: 'custom' },
  { id: 'none' }
];

// Meme 3 modes pour le kicker (petite ligne au-dessus du titre, ex. "Fin de
// projet") — reutilise directement PHRASE_MODES plutot qu'une copie, les
// libelles/logique sont identiques.
const KICKER_MODES = PHRASE_MODES;

// Doivent rester coherents avec FRONT_COVER_VARIANTS/BACK_COVER_VARIANTS
// (backend/services/composition/{front,back}CoverRenderer.js) — meme
// convention/meme avertissement que l'ancien BookCoverDesignerLuxe.js.
// MIROIR de backend/services/composition/coverTheme.js COVER_COLORS — meme
// convention de duplication assumee que les autres petites tables partagees
// de ce projet (dimensions de format, palette de texte). Les jetons doivent
// rester identiques des deux cotes : c'est le backend qui decide du rendu
// reel, ceci ne sert qu'a afficher les pastilles.
//
// Que des matieres, aucune couleur vive : un selecteur libre produirait des
// couvertures criardes, et c'est le produit qui en souffrirait. Les quatre
// teintes ajoutees le 2026-09-25 sont des toiles de reliure classiques
// (vert anglais, bordeaux, bleu paon) et un rose poudre — la palette reste
// FERMEE, et chaque teinte a ete verifiee au contraste cote backend.
const COVER_COLORS = [
  { token: 'ivoire', hex: '#fffdf8' },
  { token: 'blanc', hex: '#ffffff' },
  { token: 'lin', hex: '#ede6d6' },
  { token: 'grege', hex: '#d6cfc2' },
  { token: 'poudre', hex: '#e3cfc7' },
  { token: 'vert', hex: '#2f4739' },
  { token: 'bordeaux', hex: '#5b2233' },
  { token: 'paon', hex: '#1c4a5a' },
  { token: 'encre', hex: '#241f18' },
  { token: 'nuit', hex: '#1f2a33' }
];

// LE STYLE DE L ALBUM (2026-09-25) : comment les photos se separent les
// unes des autres, UN SEUL reglage pour tout le livre — meme raison que la
// couleur de couverture juste au-dessus, meme mecanique de miroir avec le
// backend (services/composition/albumStyle.js).
const ALBUM_STYLES = [
  { token: 'nu' },
  { token: 'filet' },
  { token: 'encadre' }
];

// `hasPhoto` (retour utilisateur, 2026-10-04 : "mettre une icone d'image
// lorsqu'il y'a une image... comme ca on saura visuellement en regardant
// directement le template") — une icone discrete se superpose a la vignette
// des gabarits qui affichent reellement une photo, pour le reconnaitre d'un
// coup d'oeil avant meme de cliquer. AUTO n'en porte jamais (il peut, selon
// le contenu du livre, produire l'un ou l'autre).
const FRONT_FORMATS = [
  { id: 'AUTO' },
  { id: 'COVER_PHOTO', shape: 'photo-band', hasPhoto: true },
  { id: 'COVER_PHOTO_TITLE', shape: 'photo-full', hasPhoto: true },
  { id: 'COVER_MINIMAL', shape: 'text-only' },
  { id: 'COVER_MULTI_PHOTO', shape: 'photo-trio', hasPhoto: true },
  { id: 'COVER_SPLIT', shape: 'split', hasPhoto: true },
  { id: 'COVER_FRAMED', shape: 'framed', hasPhoto: true }
];

const BACK_FORMATS = [
  { id: 'AUTO' },
  { id: 'BACK_MINIMAL', shape: 'back-minimal' },
  { id: 'BACK_STATS', shape: 'back-stats' },
  { id: 'BACK_PHOTO_STATS', shape: 'back-photo', hasPhoto: true }
];

const SAVE_DEBOUNCE_MS = 700;

// MIROIR de FORMAT_DIMENSIONS_MM (AtelierBookView.js/BookPreviewFinalLuxe.js)
// — meme convention de duplication assumee que COVER_COLORS/ALBUM_STYLES un
// peu plus haut. Sert uniquement a donner aux vignettes le bon RATIO (retour
// utilisateur, 2026-09-27 : "les miniatures doivent representer fidelement
// le rendu reel de la couverture") : sans ca, un livret carre (200x200)
// affichait des vignettes portrait comme un standard/luxe (210x280) — un
// format entier rendu faux d'un simple coup d'oeil.
const COVER_RATIO_BY_FORMAT = {
  livret: 200 / 200,
  standard: 210 / 280,
  luxe: 210 / 280
};

const normalizeText = (value) => (value === null || value === undefined ? '' : String(value).trim());

function CoverFormatMiniPreview({ shape, ratio }) {
  const { t } = useTranslation('atelier');
  const pageStyle = ratio ? { aspectRatio: ratio } : undefined;
  switch (shape) {
    case 'photo-band':
      return (
        <div className="cvrmini-page" style={pageStyle}>
          <span className="cvrmini-photo" style={{ height: '78%' }} />
          <span className="cvrmini-band" style={{ height: '22%' }}>
            <span className="cvrmini-line" style={{ width: '60%' }} />
          </span>
        </div>
      );
    case 'photo-full':
      return (
        <div className="cvrmini-page" style={pageStyle}>
          <span className="cvrmini-photo cvrmini-photo-bg" />
          <span className="cvrmini-scrim" />
          <span className="cvrmini-line cvrmini-line-on-photo" style={{ width: '55%' }} />
        </div>
      );
    case 'text-only':
      return (
        <div className="cvrmini-page cvrmini-center" style={pageStyle}>
          <span className="cvrmini-line" style={{ width: '70%' }} />
          <span className="cvrmini-rule" />
          <span className="cvrmini-line cvrmini-line-sm" style={{ width: '45%' }} />
        </div>
      );
    case 'photo-trio':
      return (
        <div className="cvrmini-page" style={pageStyle}>
          <span className="cvrmini-photo" style={{ height: '46%' }} />
          <span className="cvrmini-row" style={{ height: '24%' }}>
            <span className="cvrmini-photo" />
            <span className="cvrmini-photo" />
          </span>
          <span className="cvrmini-band" style={{ height: '30%' }}>
            <span className="cvrmini-line" style={{ width: '55%' }} />
          </span>
        </div>
      );
    case 'split':
      return (
        <div className="cvrmini-page cvrmini-row-full" style={pageStyle}>
          <span className="cvrmini-photo" style={{ width: '55%', height: '100%' }} />
          <span className="cvrmini-col">
            <span className="cvrmini-line" style={{ width: '75%' }} />
            <span className="cvrmini-line cvrmini-line-sm" style={{ width: '50%' }} />
          </span>
        </div>
      );
    case 'framed':
      return (
        <div className="cvrmini-page cvrmini-center" style={pageStyle}>
          <span className="cvrmini-photo cvrmini-photo-framed" />
          <span className="cvrmini-line" style={{ width: '55%' }} />
        </div>
      );
    case 'back-minimal':
      return (
        <div className="cvrmini-page cvrmini-center" style={pageStyle}>
          <span className="cvrmini-line cvrmini-line-italic" style={{ width: '65%' }} />
          <span className="cvrmini-dot" />
        </div>
      );
    case 'back-stats':
      // Memes blocs que 'back-minimal' (2026-10-04 : le rendu reel ne
      // distingue plus les deux, voir backCoverRenderer.renderBackStats) —
      // la ligne de chiffres a disparu, cette vignette ne doit plus la
      // promettre.
      return (
        <div className="cvrmini-page cvrmini-center" style={pageStyle}>
          <span className="cvrmini-line cvrmini-line-italic" style={{ width: '65%' }} />
          <span className="cvrmini-dot" />
        </div>
      );
    case 'back-photo':
      return (
        <div className="cvrmini-page cvrmini-center" style={pageStyle}>
          <span className="cvrmini-photo cvrmini-photo-small" />
          <span className="cvrmini-line cvrmini-line-italic" style={{ width: '55%' }} />
        </div>
      );
    default:
      return (
        <div className="cvrmini-page cvrmini-auto" style={pageStyle}>
          <span>{t('coverPanel.autoPreviewLabel')}</span>
        </div>
      );
  }
}

function FormatPhotoBadge({ title }) {
  return (
    <span className="coverlite-format-photo-badge" title={title} aria-hidden="true">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10.5" r="1.5" />
        <path d="M21 15l-5-5L5 19" />
      </svg>
    </span>
  );
}

function FormatGallery({ formats, selectedId, onSelect, ratio, labelNamespace }) {
  const { t } = useTranslation('atelier');
  return (
    <div className="coverlite-format-grid">
      {formats.map((format) => (
        <button
          key={format.id}
          type="button"
          className={`coverlite-format-option ${selectedId === format.id ? 'is-selected' : ''}`}
          onClick={() => onSelect(format.id)}
        >
          <span className="coverlite-format-preview-wrap">
            <CoverFormatMiniPreview shape={format.shape} ratio={ratio} />
            {format.hasPhoto && <FormatPhotoBadge title={t('coverPanel.hasPhotoBadge')} />}
          </span>
          <span className="coverlite-format-label">{t(`coverPanel.${labelNamespace}.${format.id}`)}</span>
        </button>
      ))}
    </div>
  );
}

const buildInitialState = (book) => {
  const overrides = (book?.cover_overrides && typeof book.cover_overrides === 'object') ? book.cover_overrides : {};
  const closingPhraseMode = ['custom', 'none'].includes(overrides.closingPhraseMode) ? overrides.closingPhraseMode : 'auto';
  const kickerMode = ['custom', 'none'].includes(overrides.kickerMode) ? overrides.kickerMode : 'auto';
  const frontVariant = FRONT_FORMATS.some((format) => format.id === overrides.frontVariant) ? overrides.frontVariant : 'AUTO';
  const backVariant = BACK_FORMATS.some((format) => format.id === overrides.backVariant) ? overrides.backVariant : 'AUTO';

  return {
    // book.title n'est PAS dans cover_overrides (c'est deja une colonne a
    // part entiere, voir handleUpdateBook/coverComposer.js) mais suit le
    // meme cycle de vie "brouillon local -> sauvegarde debounce" que le
    // reste de ce formulaire, pour rester modifiable ici sans repasser par
    // l'onglet Configuration (retour utilisateur).
    title: normalizeText(book?.title),
    frontVariant,
    backVariant,
    // Couleur de tout l habillage de couverture (recto, dos et 4e) — voir
    // backend coverTheme.applyCoverColor. Une valeur inconnue retombe sur
    // le defaut du theme plutot que d etre appliquee telle quelle.
    coverColor: COVER_COLORS.some((c) => c.token === overrides.coverColor) ? overrides.coverColor : '',
    // Style de l'album (nu/filet/encadre) — voir backend albumStyle.js. Un
    // jeton inconnu retombe sur 'nu', meme principe que coverColor.
    albumStyle: ALBUM_STYLES.some((s) => s.token === overrides.albumStyle) ? overrides.albumStyle : 'nu',
    // frontPhotoId/backPhotoId n'ont PLUS de champ ici (retour utilisateur,
    // 2026-09-26 : "inutile d'avoir les photos dans l'encart de mise en
    // page... les photos seront gerees comme sur les pages, en cliquant a
    // l'interieur de la page couverture") — le choix se fait desormais en
    // cliquant directement sur la couverture/4e affichee (voir
    // CoverPhotoOverlay dans AtelierBookView.js, meme mecanisme que les
    // pages interieures). Ce panneau ne les LIT plus ni ne les ECRIT plus :
    // ils survivent au spread `...book.cover_overrides` du payload
    // d'enregistrement plus bas, intacts.
    subtitle: normalizeText(overrides.subtitle),
    dateLabel: normalizeText(overrides.dateLabel),
    closingPhraseMode,
    closingPhraseText: normalizeText(overrides.closingPhraseText),
    kickerMode,
    kickerText: normalizeText(overrides.kickerText)
  };
};

const getStateSignature = (state) => JSON.stringify(state);

function AtelierCoverPanel({ book, face, onUpdateBook, onSaved, onSwitchFace }) {
  const { t } = useTranslation('atelier');
  const coverRatio = COVER_RATIO_BY_FORMAT[book?.print_format] || COVER_RATIO_BY_FORMAT.standard;
  const [formState, setFormState] = useState(() => buildInitialState(book));
  const [savedSignature, setSavedSignature] = useState(() => getStateSignature(buildInitialState(book)));
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    const nextState = buildInitialState(book);
    setFormState(nextState);
    setSavedSignature(getStateSignature(nextState));
    setSaveStatus('idle');
  }, [book?.id, book?.cover_overrides, book?.title]);

  const stateSignature = useMemo(() => getStateSignature(formState), [formState]);

  const updateField = (field, value) => {
    setFormState((previous) => ({ ...previous, [field]: value }));
  };

  useEffect(() => {
    if (stateSignature === savedSignature) return undefined;

    setSaveStatus('pending');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await onUpdateBook({
          // book.title est une colonne a part (pas cover_overrides) — voir
          // buildInitialState. coverComposer.js retombe deja sur "Livre
          // souvenir" si vide, meme repli que l'onglet Configuration : pas
          // besoin de le reappliquer ici.
          title: formState.title,
          cover_overrides: {
            // Les surcharges que CE panneau ne gere pas (recadrages
            // frontPhotoAdjust/backPhotoAdjust, poses ailleurs dans
            // l'atelier) doivent survivre : sans ce report, modifier un
            // titre ici effacait silencieusement un cadrage regle a la
            // main. Meme precaution qu'ailleurs dans BookAtelierLuxe.js.
            ...(book?.cover_overrides && typeof book.cover_overrides === 'object' ? book.cover_overrides : {}),
            frontVariant: formState.frontVariant,
            backVariant: formState.backVariant,
            coverColor: formState.coverColor || null,
            albumStyle: formState.albumStyle || 'nu',
            subtitle: formState.subtitle,
            dateLabel: formState.dateLabel,
            closingPhraseMode: formState.closingPhraseMode,
            closingPhraseText: formState.closingPhraseText,
            kickerMode: formState.kickerMode,
            kickerText: formState.kickerText
          }
        });
        setSavedSignature(stateSignature);
        setSaveStatus('saved');
        if (onSaved) onSaved();
      } catch (_error) {
        setSaveStatus('error');
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateSignature]);

  const saveStatusLabel = saveStatus === 'idle' ? '' : (
    saveStatus === 'saved' ? `✓ ${t('coverPanel.saveStatus.saved')}` : t(`coverPanel.saveStatus.${saveStatus}`)
  );

  return (
    <aside className="atelier-layout-panel atelier-cover-panel">
      {/* Plus de titre "Couverture"/"4e de couverture" ici (retour
          utilisateur, 2026-09-27 : deja porte par le titre du tiroir,
          AtelierDrawer.js — voir BookAtelierLuxe.js, title={viewKind===
          'spread' ? 'Mise en page' : 'Couverture'}). Le statut d'enregistrement
          garde sa place, seul, aligne a droite. */}
      {saveStatusLabel && (
        <div className="atelier-layout-panel-head atelier-layout-panel-head-status-only">
          <span className={`atelier-save-status is-${saveStatus === 'error' ? 'error' : saveStatus === 'saved' ? 'saved' : 'saving'}`}>
            {saveStatusLabel}
          </span>
        </div>
      )}

      {/* Passage direct d'une face a l'autre. Les deux faces sont aux deux
          EXTREMITES opposees du livre : pour aller du recto a la 4e il
          fallait feuilleter tout le livre, ou repasser par la pellicule
          (retour utilisateur 2026-09-14). Or on les regle ensemble — meme
          teinte, meme habillage, la photo de l'une depend de l'autre.
          Libelle plus discret et lien texte simple (retour utilisateur,
          2026-09-27 : "fonctionnel mais visuellement un peu trop present")
          — un bloc pleine largeur a bordure pointillee attirait autant l'oeil
          que les vrais reglages en dessous, pour une action secondaire. */}
      {onSwitchFace && (
        <button type="button" className="coverlite-face-switch" onClick={onSwitchFace}>
          {face === 'front' ? `${t('coverPanel.switchToBack')} →` : `← ${t('coverPanel.switchToFront')}`}
        </button>
      )}

      {face === 'front' ? (
        <>
          {/* Titre du livre : deja modifiable dans Configuration, mais pas
              depuis l'atelier (retour utilisateur) — ajoute ici pour ne
              plus avoir a changer d'onglet en cours de mise en page de la
              couverture. Ecrit directement sur book.title (pas
              cover_overrides, voir buildInitialState), meme colonne que
              Configuration : peu importe l'ecran utilise en dernier. */}
          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.bookTitleLabel')}</span>
            <input
              type="text"
              className="input-luxe"
              value={formState.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder={t('coverPanel.bookTitlePlaceholder')}
              maxLength={180}
            />
          </div>

          {/* Couleur de l'habillage — UN seul reglage pour le recto, le dos
              et la 4e : sur un Luxe, les trois ne forment qu'une seule
              feuille qui enveloppe le livre, deux teintes differentes
              ressembleraient a une erreur d'impression. La couleur du texte
              n'est pas proposee : elle est deduite du contraste avec le fond
              (voir backend coverTheme.applyCoverColor), donc un titre
              illisible est impossible. */}
          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.coverColorLabel')}</span>
            <div className="coverlite-colors" role="group" aria-label={t('coverPanel.coverColorGroupLabel')}>
              <button
                type="button"
                className={`coverlite-color is-auto ${!formState.coverColor ? 'is-active' : ''}`}
                onClick={() => updateField('coverColor', '')}
                title={t('coverPanel.autoColorTitle')}
              >
                {t('coverPanel.autoColorLabel')}
              </button>
              {COVER_COLORS.map((color) => (
                <button
                  key={color.token}
                  type="button"
                  className={`coverlite-color ${formState.coverColor === color.token ? 'is-active' : ''}`}
                  style={{ background: color.hex }}
                  onClick={() => updateField('coverColor', color.token)}
                  title={t(`coverPanel.coverColors.${color.token}`)}
                  aria-label={t(`coverPanel.coverColors.${color.token}`)}
                />
              ))}
            </div>
            <p className="coverlite-hint">
              {t('coverPanel.coverColorHint')}
            </p>
          </div>

          {/* Style de l'album — UN SEUL reglage pour tout le livre, jamais
              page par page (2026-09-25) : un choix qui changerait a chaque
              page ne ferait plus un album, mais une collection de pages. */}
          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.albumStyleLabel')}</span>
            <div className="coverlite-colors" role="group" aria-label={t('coverPanel.albumStyleGroupLabel')}>
              {ALBUM_STYLES.map((style) => (
                <button
                  key={style.token}
                  type="button"
                  // Reutilise la forme "Auto" (pilule texte) de la couleur
                  // ci-dessus : c'est un choix textuel, pas une pastille de
                  // teinte, la meme classe evite d'inventer un style de plus.
                  className={`coverlite-color is-auto ${formState.albumStyle === style.token ? 'is-active' : ''}`}
                  onClick={() => updateField('albumStyle', style.token)}
                >
                  {t(`coverPanel.albumStyles.${style.token}`)}
                </button>
              ))}
            </div>
            <p className="coverlite-hint">
              {formState.albumStyle === 'filet' && t('coverPanel.albumStyleHintFilet')}
              {formState.albumStyle === 'encadre' && t('coverPanel.albumStyleHintEncadre')}
              {formState.albumStyle === 'nu' && t('coverPanel.albumStyleHintNu')}
              {' '}{t('coverPanel.albumStyleHintSuffix')}
            </p>
          </div>

          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.frontFormatLabel')}</span>
            <FormatGallery
              formats={FRONT_FORMATS}
              selectedId={formState.frontVariant}
              onSelect={(id) => updateField('frontVariant', id)}
              ratio={coverRatio}
              labelNamespace="frontFormats"
            />
          </div>

          {/* "Kicker" : petite ligne au-dessus du titre, ex. "Fin de projet"
              — automatiquement tiree de l'occasion choisie a la creation du
              livre, mais restee non modifiable jusqu'ici (retour
              utilisateur : "pareil pour le titre 'fin de projet'"). Meme
              3 etats que la phrase de 4e de couverture (auto/personnalise/
              aucun), mais un simple <select> plutot que 3 boutons cote a
              cote — retour utilisateur : "ca ne sert a rien d'avoir 3
              boutons pour ca" (un reglage secondaire, une ligne au-dessus
              du titre, ne justifiait pas le meme poids visuel que le
              format de couverture ou la phrase de 4e). */}
          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.kickerLabel')}</span>
            <select
              className="input-luxe"
              value={formState.kickerMode}
              onChange={(event) => updateField('kickerMode', event.target.value)}
            >
              {KICKER_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>{t(`coverPanel.phraseModes.${mode.id}`)}</option>
              ))}
            </select>
            {formState.kickerMode === 'custom' && (
              <input
                type="text"
                className="input-luxe"
                value={formState.kickerText}
                onChange={(event) => updateField('kickerText', event.target.value)}
                placeholder={t('coverPanel.kickerPlaceholder')}
                maxLength={60}
              />
            )}
          </div>

          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.subtitleLabel')}</span>
            <input
              type="text"
              className="input-luxe"
              value={formState.subtitle}
              onChange={(event) => updateField('subtitle', event.target.value)}
              placeholder={t('coverPanel.subtitlePlaceholder')}
              maxLength={220}
            />
          </div>

          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.dateLabel')}</span>
            <input
              type="text"
              className="input-luxe"
              value={formState.dateLabel}
              onChange={(event) => updateField('dateLabel', event.target.value)}
              placeholder={t('coverPanel.datePlaceholder')}
              maxLength={20}
            />
          </div>
        </>
      ) : (
        <>
          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.backFormatLabel')}</span>
            <FormatGallery
              formats={BACK_FORMATS}
              selectedId={formState.backVariant}
              onSelect={(id) => updateField('backVariant', id)}
              ratio={coverRatio}
              labelNamespace="backFormats"
            />
          </div>

          <div className="coverlite-group">
            <span className="coverlite-group-label">{t('coverPanel.closingPhraseLabel')}</span>
            {/* <select> plutot que 3 boutons — meme simplification et meme
                raison que le libelle au-dessus du titre plus haut (retour
                utilisateur : "pas besoin de 3 boutons"). */}
            <select
              className="input-luxe"
              value={formState.closingPhraseMode}
              onChange={(event) => updateField('closingPhraseMode', event.target.value)}
            >
              {PHRASE_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>{t(`coverPanel.phraseModes.${mode.id}`)}</option>
              ))}
            </select>
            {formState.closingPhraseMode === 'custom' && (
              <textarea
                className="input-luxe coverlite-textarea"
                value={formState.closingPhraseText}
                onChange={(event) => updateField('closingPhraseText', event.target.value)}
                placeholder={t('coverPanel.closingPhrasePlaceholder')}
                maxLength={300}
                rows={3}
              />
            )}
          </div>

        </>
      )}
    </aside>
  );
}

export default AtelierCoverPanel;
