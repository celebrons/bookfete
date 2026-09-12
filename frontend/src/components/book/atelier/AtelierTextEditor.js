import React, { useEffect, useRef, useState } from 'react';
import {
  ROLE_LABELS,
  TEXT_ROLES,
  fitTextToSlot,
  normalizeRole,
  screenStyleForRole,
  selectableColorsForRole
} from './typography';
import './AtelierTextEditor.css';

// Taille minimale a l'ecran pour ecrire confortablement. En dessous, le champ
// est agrandi (et l'indique) : voir plus bas.
const MIN_EDIT_FONT_PX = 15;

// Edition du texte DIRECTEMENT sur la page (cahier des charges typographique
// §1). Le champ se superpose exactement a l'emplacement et adopte la
// typographie reelle du role, mise a l'echelle de la page affichee : ce que
// l'utilisateur voit en tapant est ce que le PDF imprimera (§18).
//
// Volontairement PAS un editeur riche (§2) : pas de police libre, pas
// d'effets, pas de rotation, pas de positionnement libre. La barre flottante
// n'expose que ce que le cahier des charges autorise — le ROLE (qui decide
// police/taille/graisse/interligne), l'alignement, et une couleur prise dans
// la palette fermee. Il n'y a deliberement aucun selecteur de police : en
// proposer un reviendrait a rendre la coherence du livre facultative (§4).

function AlignIcon({ mode }) {
  // Largeurs de lignes evoquant chaque alignement — plus lisible qu'un
  // libelle texte dans une barre aussi petite.
  const rows = {
    left: [100, 60, 90, 50],
    center: [100, 60, 90, 50],
    right: [100, 60, 90, 50],
    justify: [100, 100, 100, 60]
  }[mode] || [100, 60, 90, 50];

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {rows.map((width, index) => {
        const w = (width / 100) * 12;
        const x = mode === 'right' ? 13 - w : mode === 'center' ? (14 - w) / 2 : 1;
        return <rect key={index} x={x} y={2 + index * 3} width={w} height="1.4" rx="0.7" fill="currentColor" />;
      })}
    </svg>
  );
}

function AtelierTextEditor({
  item,
  rect,
  role,
  styleOverrides,
  printFormat,
  // Largeur de l'incrustation, en px ET en mm : les deux decrivent la meme
  // chose (la zone de contenu de la page), ce qui donne l'echelle exacte.
  reference,
  slotWidthMm,
  slotHeightMm,
  onSave,
  onCancel
}) {
  const safeRole = normalizeRole(role);
  const [draft, setDraft] = useState(item?.text || '');
  const [currentRole, setCurrentRole] = useState(safeRole);
  const [overrides, setOverrides] = useState(styleOverrides || {});
  const fieldRef = useRef(null);
  const rootRef = useRef(null);

  // Le curseur doit etre dans le texte des l'ouverture : l'utilisateur a
  // clique POUR ecrire, lui demander un second clic serait absurde.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  // Echap annule, Ctrl/Cmd+Entree valide. Un clic en dehors VALIDE plutot
  // que d'annuler : perdre ce que l'on vient de taper parce qu'on a clique a
  // cote est le pire comportement possible pour un editeur en ligne.
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCancel();
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onSave({ text: draft, role: currentRole, styleOverrides: overrides });
      }
    }
    function handleOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        onSave({ text: draft, role: currentRole, styleOverrides: overrides });
      }
    }
    document.addEventListener('keydown', handleKey);
    // `true` : capture, pour passer avant les gestionnaires de clic des
    // emplacements voisins (qui ouvriraient aussitot un autre editeur).
    document.addEventListener('mousedown', handleOutside, true);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleOutside, true);
    };
  }, [draft, currentRole, overrides, onSave, onCancel]);

  // Adaptation automatique en temps reel (§9) : calculee avec EXACTEMENT la
  // meme fonction que le serveur, donc l'alerte affichee ici correspond a ce
  // que le controle avant commande dira.
  // `overrides` transmis : l'ajustement doit connaitre les choix explicites
  // de l'utilisateur pour ne jamais les contredire (un alignement choisi a la
  // main n'est pas remplace par le centrage automatique des textes courts).
  const fit = fitTextToSlot({
    text: draft, role: currentRole, formatId: printFormat, slotWidthMm, slotHeightMm, overrides
  });

  const trueStyle = screenStyleForRole(currentRole, printFormat, reference, {
    ...overrides,
    // La taille affichee suit l'ajustement automatique, DANS LES DEUX SENS :
    // reduite si le texte a du retrecir pour tenir, agrandie s'il laissait son
    // emplacement a moitie vide. Ce que l'on voit en tapant est ce qui sera
    // imprime.
    sizePt: fit.fontSizePt,
    align: fit.align
  });

  // A l'echelle reelle, un corps de texte de 10pt sur une page entiere
  // affichee dans l'atelier fait ~9px : c'est JUSTE, mais on n'ecrit pas
  // confortablement dedans (retour utilisateur : "le texte est tjrs tres
  // petit"). On agrandit donc la saisie jusqu'a un minimum lisible — et on
  // le DIT (voir le libelle de la barre) plutot que de laisser croire que
  // c'est la taille d'impression. Le controle de debordement, lui, reste
  // calcule sur la taille REELLE : agrandir l'affichage ne change rien au
  // verdict.
  // Remplissage de l'emplacement, en %. Deux contraintes peuvent saturer :
  // la HAUTEUR disponible (cas du corps de texte, qui descend jusqu'au bas de
  // la page) et le NOMBRE DE LIGNES du role (cas du titre, limite a 3). On
  // retient la plus contraignante — c'est elle qui dira "stop" en premier.
  //
  // Ajoute le 2026-09-11 : jusque-la, aucun retour entre 0 % et 100 %, puis
  // une alerte rouge d'un coup. Sur un corps de texte il faut ~580 mots pour
  // saturer : l'utilisateur ecrivait a l'aveugle, d'autant que le champ est
  // AGRANDI pour la saisie et parait donc plein bien avant de l'etre.
  const heightRatio = fit.usableHeightMm > 0 ? fit.estimatedHeightMm / fit.usableHeightMm : 0;
  const lineRatio = fit.maxLines ? fit.lines / fit.maxLines : 0;
  const fillPct = Math.round(Math.max(heightRatio, lineRatio) * 100);
  const isAtLimit = fit.status === 'overflow';
  // Seuil d'alerte anticipee : assez tot pour pouvoir reagir, assez tard pour
  // ne pas alarmer sur un texte encore confortable.
  const NEAR_LIMIT_PCT = 85;
  const isNearLimit = !isAtLimit && fillPct >= NEAR_LIMIT_PCT;
  // Plus aucune marge de reduction : le texte est deja a la plus petite
  // taille que le role autorise, on ne peut donc plus le faire rentrer en
  // rapetissant (c'est la limite d'impression du role).
  const atSmallestSize = fit.fontSizePt <= fit.minPt;

  const truePx = parseFloat(trueStyle.fontSize) || 0;
  const editScale = truePx > 0 && truePx < MIN_EDIT_FONT_PX ? MIN_EDIT_FONT_PX / truePx : 1;
  const isMagnified = editScale > 1.01;

  const fieldStyle = {
    ...trueStyle,
    fontSize: `${truePx * editScale}px`,
    // Agrandi, le texte peut depasser la hauteur du cadre : on autorise le
    // defilement plutot que de masquer ce que l'utilisateur vient de taper.
    overflowY: isMagnified ? 'auto' : 'hidden'
  };

  const colors = selectableColorsForRole(currentRole);

  // Ou poser la barre de reglages : du cote ou il y a REELLEMENT de la place.
  //
  // Ma premiere regle ("sous le champ si celui-ci commence dans le haut de la
  // page") etait fausse des qu'un emplacement commence haut ET descend jusqu'en
  // bas — exactement le cas du corps de texte d'un titre+texte (24% -> 100%) :
  // "en dessous" tombait hors de la page et la barre disparaissait (bug
  // signale 2026-09-11). On mesure donc la place disponible de chaque cote.
  const slotTop = Number(rect?.top) || 0;
  const slotHeight = Number(rect?.height) || 0;
  const roomAbovePct = slotTop;
  const roomBelowPct = Math.max(0, 100 - (slotTop + slotHeight));
  // Hauteur approximative de la barre + une alerte, en % de la hauteur de
  // page : en dessous, elle deborderait.
  const CONTROLS_ROOM_PCT = 14;

  let placement;
  if (roomBelowPct >= CONTROLS_ROOM_PCT) placement = 'below';
  else if (roomAbovePct >= CONTROLS_ROOM_PCT) placement = 'above';
  // Emplacement occupant toute la hauteur (texte pleine page) : aucune place
  // ni au-dessus ni en dessous. La barre se pose alors DANS le champ, ancree
  // en bas — elle recouvre un peu le texte, ce qui reste infiniment
  // preferable a une barre invisible.
  else placement = 'inside';

  // Largeur disponible pour la barre. Elle etait bornee a la largeur de
  // l'EMPLACEMENT, ce qui est trop peu : sur une legende ou une colonne de
  // temoignage, la barre s'enroulait sur cinq ou six lignes, et avant cela
  // elle debordait et se faisait rogner par .atelier-page-pane
  // (overflow:hidden) — la liste "Style" apparaissait coupee (signale le
  // 2026-09-12, capture a l'appui).
  //
  // La barre flotte AU-DESSUS de la page : rien ne l'oblige a rester dans les
  // bornes de l'emplacement, seulement dans celles de la page. On etire donc
  // le bloc de controles sur toute la largeur de la zone de contenu — exprimee
  // en % de l'emplacement, puisque c'est lui le conteneur de reference — et la
  // barre s'y centre. Le rattachement visuel a l'emplacement reste assure par
  // l'adjacence verticale et par le cadre dore du champ.
  const slotLeft = Number(rect?.left) || 0;
  const slotWidth = Number(rect?.width) || 0;
  const controlsSpanStyle = slotWidth > 0
    ? {
      left: `${(-slotLeft / slotWidth) * 100}%`,
      width: `${(100 / slotWidth) * 100}%`,
      maxWidth: 'none',
      transform: 'none'
    }
    : undefined;

  return (
    <div
      ref={rootRef}
      className="atelier-text-editor"
      style={{ top: `${rect.top}%`, left: `${rect.left}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        ref={fieldRef}
        className={`atelier-text-editor-field ${isAtLimit ? 'is-at-limit' : ''} ${isNearLimit ? 'is-near-limit' : ''}`}
        style={fieldStyle}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={`Modifier le texte (${ROLE_LABELS[currentRole]})`}
      />

      {/* Barre + alertes regroupees : elles doivent rester du MEME cote du
          champ, sinon elles se chevauchent selon la position de
          l'emplacement dans la page. */}
      <div className={`atelier-text-controls is-${placement}`} style={controlsSpanStyle}>
      {/* Barre minimale (§6). Trois reglages, pas un de plus. */}
      {/* Le preventDefault (qui empeche le champ de perdre le focus quand on
          clique un reglage) est pose sur CHAQUE BOUTON, jamais sur la barre
          entiere : sur le conteneur, il empechait aussi la liste deroulante
          native de s'ouvrir — elle paraissait vide (bug signale 2026-09-11 :
          "la liste deroulante STYLE ne propose rien"). */}
      <div className="atelier-text-toolbar">
        {/* Sans libelle, cette liste n'etait pas comprise (retour utilisateur
            2026-09-11 : "a quoi sert texte avec la fleche ?"). C'est le
            reglage le plus important de la barre — il decide police, taille,
            graisse et interligne — donc il doit se nommer. */}
        <label className="atelier-text-toolbar-field">
          <span className="atelier-text-toolbar-label">Style</span>
          <select
            className="atelier-text-toolbar-role"
            value={currentRole}
            onChange={(event) => setCurrentRole(event.target.value)}
            title="Style du texte : choisit automatiquement la police, la taille et la graisse"
          >
            {TEXT_ROLES.map((value) => (
              <option key={value} value={value}>{ROLE_LABELS[value]}</option>
            ))}
          </select>
        </label>

        {/* Taille reelle a l'impression. A l'echelle, un corps de texte de
            10 pt sur une page entiere affichee dans l'atelier fait une
            dizaine de pixels : c'est petit, mais c'est JUSTE (§1 WYSIWYG).
            L'afficher evite de croire a un defaut d'affichage — et rappelle
            que la loupe du livre permet de travailler en plus grand. */}
        <span className="atelier-text-toolbar-size" title="Taille reelle a l'impression">
          {fit.fontSizePt} pt
        </span>

        {/* Jauge de remplissage : un retour CONTINU, pour voir venir la
            limite au lieu de la decouvrir d'un coup. */}
        <span
          className={`atelier-text-fill ${isAtLimit ? 'is-at-limit' : ''} ${isNearLimit ? 'is-near-limit' : ''}`}
          title="Place occupee dans l'emplacement"
        >
          <span className="atelier-text-fill-bar">
            <span className="atelier-text-fill-level" style={{ width: `${Math.min(100, fillPct)}%` }} />
          </span>
          <span className="atelier-text-fill-value">{Math.min(999, fillPct)} %</span>
        </span>

        <span className="atelier-text-toolbar-sep" aria-hidden="true" />

        <div className="atelier-text-toolbar-group" role="group" aria-label="Alignement">
          {['left', 'center', 'right', 'justify'].map((mode) => (
            <button
              key={mode}
              type="button"
              className={`atelier-text-toolbar-btn ${(overrides.align || fit.align) === mode ? 'is-active' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOverrides((prev) => ({ ...prev, align: mode }))}
              title={`Aligner : ${mode}`}
              aria-label={`Aligner : ${mode}`}
            >
              <AlignIcon mode={mode} />
            </button>
          ))}
        </div>

        <span className="atelier-text-toolbar-sep" aria-hidden="true" />

        <div className="atelier-text-toolbar-group" role="group" aria-label="Couleur">
          {colors.map((color) => (
            <button
              key={color.token}
              type="button"
              className={`atelier-text-swatch ${(overrides.color || fit.colorToken) === color.token ? 'is-active' : ''}`}
              style={{ background: color.hex }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setOverrides((prev) => ({ ...prev, color: color.token }))}
              title={color.label}
              aria-label={color.label}
            />
          ))}
        </div>

        <span className="atelier-text-toolbar-sep" aria-hidden="true" />

        {/* Enregistrement EXPLICITE. Le clic en dehors et Ctrl+Entree
            enregistrent deja, mais rien ne le disait : l'utilisateur a
            demande "comment faire pour qu'il s'enregistre ?" (2026-09-11).
            Un mecanisme de sauvegarde qu'il faut deviner n'en est pas un. */}
        <button
          type="button"
          className="atelier-text-save-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSave({ text: draft, role: currentRole, styleOverrides: overrides })}
          title="Enregistrer (ou cliquez simplement en dehors du cadre)"
        >
          Enregistrer
        </button>
      </div>

      {/* Alerte LEGERE (§9) : on previent, on ne bloque pas, et on ne coupe
          surtout pas le texte en silence. */}
      {isAtLimit && (
        <p className="atelier-text-alert is-error">
          <strong>Limite atteinte — arretez ici.</strong>{' '}
          {atSmallestSize
            ? 'Le texte est deja a la plus petite taille imprimable : ce qui suit ne tiendra pas sur la page.'
            : 'Ce texte ne rentre plus dans son emplacement.'}{' '}
          Raccourcissez-le, ou choisissez une mise en page plus genereuse.
        </p>
      )}
      {isNearLimit && (
        <p className="atelier-text-alert is-warning">
          Vous approchez du bas de l'emplacement ({fillPct} % occupe).
        </p>
      )}
      {!isAtLimit && fit.status === 'reduced' && (
        <p className="atelier-text-alert">
          Texte reduit automatiquement pour tenir dans l'emplacement.
        </p>
      )}
      {isMagnified && (
        <p className="atelier-text-alert is-info">
          Affiche en plus grand pour ecrire. Taille reelle a l'impression : {fit.fontSizePt} pt.
        </p>
      )}
      </div>
    </div>
  );
}

export default AtelierTextEditor;
