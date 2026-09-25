import React, { useEffect, useRef, useState } from 'react';
import { getOverlayGeometry, getOverlayInsetPct, getPageMetrics } from './atelierLayoutGeometry';
import { makeSlotHandlers } from './atelierSlotInteractions';
import { slotAcceptsItem } from './atelierLayouts';
import { checkSlotImageFit } from './photoQuality';
import AtelierPhotoLightbox from './AtelierPhotoLightbox';
import AtelierTextEditor from './AtelierTextEditor';
import { defaultRoleForSlot, slotBoxMm } from './textQuality';
import PhotoFitBadge from '../../common/PhotoFitBadge';

// Incrustation directe sur la page centrale ("tester un truc" — variante
// demandee en plus du panneau "Mise en page" existant, pas a sa place) :
// mêmes emplacements, même etat (draftSlotItemIds), même glue de
// glisser-deposer (atelierSlotInteractions) que le panneau de droite —
// seulement positionnes par-dessus le vrai rendu (l'iframe de la page) pour
// pouvoir deposer directement au bon endroit visuel plutot que sur une liste
// abstraite a cote. Approximatif par construction (voir
// atelierLayoutGeometry.js) : le panneau de droite reste utilisable en
// parallele, cette incrustation n'est qu'un raccourci visuel.
//
// L'iframe en dessous a pointer-events:none (voir BookAtelierLuxe.css) : les
// clics/drops passent donc naturellement a travers jusqu'a ces emplacements,
// sans qu'il soit necessaire de communiquer avec le contenu de l'iframe.
// Libelles d'un emplacement VIDE. Ils doivent dire quoi FAIRE, pas nommer un
// type : "Texte" n'indiquait ni qu'on peut y glisser un souvenir, ni qu'on
// peut ecrire directement dedans (retour utilisateur 2026-09-11).
const SLOT_LABELS = {
  photo: 'Glisser ou choisir une photo',
  text: 'Glisser un souvenir ou écrire',
  title: 'Glisser un titre ou écrire'
};

function XIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <path d="M5 5L19 19M19 5L5 19" />
    </svg>
  );
}

function CaptionIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7v12" />
      <path d="M4 17h5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function AtelierPageOverlay({
  slug, slotTypes, slotItems, onAssignSlot, onRemoveSlot, onAdjustSlot,
  selectedSidebarItem, photoAdjustments, printFormat,
  // Legende par photo ({ [itemId]: texte }) + son enregistrement. Absents =
  // aucun bouton legende affiche : aucun appelant existant n est casse.
  photoCaptions, onSaveCaption,
  // Edition du texte directement sur la page (§1). Absent = comportement
  // d'avant (clic sur un texte = retrait a deux temps), donc aucun appelant
  // existant n'est casse s'il ne fournit pas ces props.
  onSaveText, onCreateText, textRoles, textStyles,
  // Emplacement PHOTO VIDE, au clic (retour utilisateur, 2026-09-25) : ouvre
  // le choix entre une photo deja importee et un nouvel import depuis le
  // disque (voir AtelierPhotoPickerModal.js, monte par l'appelant). Absent =
  // comportement d'avant (rien ne se passe sur un emplacement vide sans
  // selection prealable dans "Mes photos") — aucun appelant existant cassé.
  onOpenPhotoPicker
}) {
  // Index de l'emplacement en cours d'edition, et largeur REELLE de
  // l'incrustation en pixels : celle-ci sert a convertir les points
  // typographiques en pixels ecran a la bonne echelle (WYSIWYG, §1).
  const [editingIndex, setEditingIndex] = useState(null);
  // Emplacement dont on edite la LEGENDE (distinct de editingIndex, qui edite
  // le texte d un emplacement texte) et sa valeur en cours de frappe.
  const [captionIndex, setCaptionIndex] = useState(null);
  const [captionDraft, setCaptionDraft] = useState('');
  // Couleur de la legende en cours d'edition. DEUX valeurs seulement : une
  // legende blanche devient illisible sur une photo tres claire, et c'est le
  // seul vrai choix a offrir (decision produit 2026-09-15). Pas de palette.
  const [captionColor, setCaptionColor] = useState('blanc');
  const [overlayWidthPx, setOverlayWidthPx] = useState(0);
  const overlayRef = useRef(null);
  // Marges reelles de CE format (et non des valeurs A4 figees) : elles
  // positionnent l'incrustation ET servent de reference d'echelle a
  // l'edition en ligne.
  const overlayInset = getOverlayInsetPct(printFormat);
  const pageMetrics = getPageMetrics(printFormat);

  useEffect(() => {
    const node = overlayRef.current;
    if (!node) return undefined;
    const measure = () => setOverlayWidthPx(node.getBoundingClientRect().width);
    measure();
    // La page se redimensionne avec la fenetre : sans cet observateur, la
    // typographie de l'editeur resterait a l'echelle du premier rendu et ne
    // correspondrait plus a ce qui est affiche dessous.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Retrait a deux temps (retour utilisateur : jamais de retrait direct au
  // clic, il faut une confirmation) — meme mecanisme que le panneau "Mise
  // en page" (AtelierLayoutPanel.js), voir atelierSlotInteractions.js pour
  // la logique partagee. Reinitialise par le `key` pose par l'appelant
  // (BookAtelierLuxe.js) a chaque changement de page/cote, pas par un effet
  // qui observerait slotItems (nouvelle reference a chaque rendu du parent).
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState(null);
  // Apercu plein ecran d'une photo a sa vraie resolution (retour
  // utilisateur, 2026-09-11) — voir AtelierPhotoLightbox.js.
  const [viewingUrl, setViewingUrl] = useState(null);

  // Retour utilisateur (2026-09-10) : "confirmer le retrait" restait affiche
  // si on cliquait ailleurs QUE sur un autre emplacement (ex. la barre
  // laterale, le header, en dehors meme du livre) — seul un clic sur un
  // AUTRE emplacement l'annulait (via onCancelRemove ci-dessous, dans
  // handleDrop/handleClick). Ecoute globale : tout clic dont la cible n'est
  // PAS a l'interieur d'un emplacement de CETTE incrustation annule la
  // confirmation en attente. Un clic a l'interieur d'un emplacement (y
  // compris celui en attente, pour confirmer) n'est jamais intercepte ici —
  // c'est deja gere par l'onClick du emplacement lui-meme, dans le meme tour
  // d'evenement.
  useEffect(() => {
    if (pendingRemoveIndex == null) return undefined;
    function handleOutsideClick(event) {
      if (!event.target.closest('.atelier-overlay-slot')) setPendingRemoveIndex(null);
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [pendingRemoveIndex]);

  const geometry = getOverlayGeometry(slug);
  if (!geometry) return null;

  const { handleDrop, handleClick } = makeSlotHandlers({
    onAssignSlot,
    onRemoveSlot,
    selectedSidebarItem,
    pendingRemoveIndex,
    onRequestRemove: setPendingRemoveIndex,
    onCancelRemove: () => setPendingRemoveIndex(null)
  });

  // Retrait explicite via la croix (retour utilisateur, 2026-09-11 :
  // "afficher une x pour supprimer") — meme etat/meme confirmation a deux
  // temps que le clic sur l'emplacement (pendingRemoveIndex), mais
  // declenche par un bouton dedie plutot que par un clic ambigu n'importe
  // ou sur la photo (qui reste par ailleurs possible, comportement
  // inchange, voir handleClick ci-dessus/atelierSlotInteractions.js).
  function handleRequestRemove(event, index) {
    event.stopPropagation();
    if (pendingRemoveIndex === index) {
      onRemoveSlot(index);
      setPendingRemoveIndex(null);
    } else {
      setPendingRemoveIndex(index);
    }
  }

  return (
    <>
      <div
        ref={overlayRef}
        className="atelier-page-overlay"
        style={{
          top: `${overlayInset.top}%`,
          left: `${overlayInset.left}%`,
          right: `${overlayInset.right}%`,
          bottom: `${overlayInset.bottom}%`
        }}
      >
        {geometry.map((rect, index) => {
          const slotType = slotTypes[index];
          const item = slotItems[index] || null;
          const rejects = Boolean(selectedSidebarItem && !slotAcceptsItem(slotType, selectedSidebarItem));
          const isPending = pendingRemoveIndex === index;
          // Controle qualite EN TEMPS REEL (cahier des charges v2, §1/§4.1) :
          // calcule localement, aucun appel reseau (voir photoQuality.js).
          // Le badge n'apparait QUE pour 'limite'/'insuffisant' — une photo
          // correcte ne declenche aucun avertissement visible (critere
          // d'acceptation n°1) et le mot "DPI" n'est jamais affiche.
          const fit = item && slotType === 'photo'
            ? checkSlotImageFit({
              item,
              layoutSlug: slug,
              slotIndex: index,
              printFormat,
              zoom: photoAdjustments?.[item.id]?.zoom,
              // Sans le mode, une photo affichee ENTIERE etait jugee comme si
              // elle etait rognee : badge de flou injustifie sur un reglage
              // que l'utilisateur venait de choisir.
              fitMode: photoAdjustments?.[item.id]?.fitMode
            })
            : null;
          return (
            <div
              key={index}
              className={`atelier-overlay-slot ${item ? 'is-filled' : ''} ${rejects ? 'is-rejecting' : ''} ${isPending ? 'is-pending-remove' : ''}`}
              style={{ top: `${rect.top}%`, left: `${rect.left}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.stopPropagation(); handleDrop(event, index, slotType); }}
              onClick={(event) => {
                event.stopPropagation();
                // Un retrait ARME passe avant tout : c'est le second clic qui
                // le confirme. Sans cette priorite, le clic de confirmation
                // rouvrait l'editeur de texte et "Confirmer le retrait ?"
                // restait affiche sans jamais pouvoir aboutir (bug signale
                // 2026-09-11).
                if (isPending) {
                  handleClick(index, item, slotType);
                  return;
                }
                // Cahier des charges v2 : le repositionnement s'ouvre AU CLIC
                // SUR LA PHOTO. Priorite a l'assignation quand un element est
                // selectionne dans "Mes souvenirs" (comportement historique) ;
                // sinon, sur une photo deja placee, on ouvre l'ajustement au
                // lieu d'armer un retrait (le retrait a desormais sa croix).
                if (!selectedSidebarItem && item && slotType === 'photo' && onAdjustSlot) {
                  onAdjustSlot(index);
                  return;
                }
                // Emplacement PHOTO VIDE (retour utilisateur, 2026-09-25) :
                // ouvrir directement le choix entre une photo deja importee
                // et un nouvel import, plutot que de forcer un detour par
                // "Mes photos" avant de revenir cliquer ici. Meme logique de
                // priorite que ci-dessus : seulement si rien n'est deja
                // selectionne dans la colonne de gauche.
                if (!selectedSidebarItem && !item && slotType === 'photo' && onOpenPhotoPicker) {
                  setPendingRemoveIndex(null);
                  onOpenPhotoPicker(index);
                  return;
                }
                // Meme principe pour le TEXTE (cahier des charges
                // typographique §1) : un clic sur un texte deja place ouvre
                // l'edition EN PLACE, il n'arme pas un retrait — le retrait a
                // sa croix, comme pour les photos.
                if (!selectedSidebarItem && slotType !== 'photo' && (item ? onSaveText : onCreateText)) {
                  // Emplacement VIDE : on ouvre l'editeur pour ecrire
                  // directement, sans passer par "Mes souvenirs" (retour
                  // utilisateur : "il faut pouvoir ecrire directement dans
                  // les cases vierges ou bien glisser un souvenir").
                  // Un retrait arme sur un AUTRE emplacement n'a plus lieu
                  // d'etre si l'utilisateur part editer un texte.
                  setPendingRemoveIndex(null);
                  setEditingIndex(index);
                  return;
                }
                handleClick(index, item, slotType);
              }}
              title={item
                ? (isPending
                  ? 'Cliquer a nouveau pour confirmer le retrait'
                  : (selectedSidebarItem
                    ? undefined
                    : (slotType === 'photo'
                      ? 'Cliquer pour ajuster le cadrage'
                      : (onSaveText ? 'Cliquer pour modifier le texte' : undefined))))
                : (!selectedSidebarItem && slotType === 'photo' && onOpenPhotoPicker
                  ? 'Cliquer pour choisir ou importer une photo'
                  : undefined)}
            >
              {!item && <span className="atelier-overlay-slot-label">{SLOT_LABELS[slotType] || 'Emplacement'}</span>}
              {!isPending && (
                <span className="atelier-overlay-slot-quality">
                  <PhotoFitBadge fit={fit} size="sm" />
                </span>
              )}
              {item && isPending && <span className="atelier-overlay-slot-confirm">Confirmer le retrait ?</span>}
              {item && !isPending && (
                <div className="atelier-overlay-slot-actions">
                  {slotType === 'photo' && onSaveCaption && (
                    <button
                      type="button"
                      className={`atelier-overlay-slot-icon-btn atelier-overlay-slot-caption-btn ${photoCaptions?.[item.id] ? 'is-set' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingRemoveIndex(null);
                        const existante = photoCaptions?.[item.id];
                        setCaptionDraft(typeof existante === 'string' ? existante : (existante?.texte || ''));
                        setCaptionColor(existante?.couleur === 'noir' ? 'noir' : 'blanc');
                        setCaptionIndex(index);
                      }}
                      title={photoCaptions?.[item.id] ? 'Modifier la légende' : 'Ajouter une légende'}
                      aria-label={photoCaptions?.[item.id] ? 'Modifier la légende' : 'Ajouter une légende'}
                    >
                      <CaptionIcon />
                    </button>
                  )}
                  {slotType === 'photo' && (
                    <button
                      type="button"
                      className="atelier-overlay-slot-icon-btn atelier-overlay-slot-view-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        // Voir le commentaire de AtelierSidebar : version
                        // d'ecran, pas l'original.
                        setViewingUrl(item.metadata?.previewUrl || item.url);
                      }}
                      title="Voir la photo en taille réelle"
                      aria-label="Voir la photo en taille réelle"
                    >
                      <EyeIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    className="atelier-overlay-slot-icon-btn atelier-overlay-slot-remove-btn"
                    onClick={(event) => handleRequestRemove(event, index)}
                    title="Retirer"
                    aria-label="Retirer"
                  >
                    <XIcon />
                  </button>
                </div>
              )}
              {/* Saisie de la legende, posee au bas de l'emplacement — la ou
                  elle s'imprimera. Entree valide, Echap annule ; vider le
                  champ retire la legende. */}
              {item && captionIndex === index && (
                <form
                  className={`atelier-overlay-caption-form is-${captionColor}`}
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSaveCaption(item.id, captionDraft, captionColor);
                    setCaptionIndex(null);
                  }}
                >
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                  <input
                    type="text"
                    autoFocus
                    maxLength={140}
                    value={captionDraft}
                    placeholder="Légende de la photo"
                    onChange={(event) => setCaptionDraft(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setCaptionIndex(null); } }}
                  />
                  {/* Blanc / noir. Les deux pastilles montrent le RESULTAT
                      (texte clair sur fond sombre, texte sombre sur fond
                      clair) plutot qu'un simple carre de couleur : c'est le
                      contraste qu'on choisit, pas la teinte. */}
                  <span className="atelier-overlay-caption-colors" role="group" aria-label="Couleur de la légende">
                    {[
                      { id: 'blanc', libelle: 'Texte blanc' },
                      { id: 'noir', libelle: 'Texte noir' }
                    ].map((choix) => (
                      <button
                        key={choix.id}
                        type="button"
                        className={`atelier-overlay-caption-color is-${choix.id} ${captionColor === choix.id ? 'is-active' : ''}`}
                        onClick={() => setCaptionColor(choix.id)}
                        title={choix.libelle}
                        aria-label={choix.libelle}
                        aria-pressed={captionColor === choix.id}
                      >
                        Aa
                      </button>
                    ))}
                  </span>
                  <button type="submit" className="atelier-overlay-caption-ok">OK</button>
                </form>
              )}
            </div>
          );
        })}

        {/* Editeur en ligne : monte DANS l'incrustation, donc positionne
            dans le meme repere en % que les emplacements — il se superpose
            exactement au texte qu'il remplace. */}
        {editingIndex != null && geometry[editingIndex] && (
          <AtelierTextEditor
            // Emplacement vide : un item "neuf" sans id — c'est onCreateText
            // qui le fera exister, et seulement si l'utilisateur ecrit
            // quelque chose.
            item={slotItems[editingIndex] || { id: null, text: '' }}
            rect={geometry[editingIndex]}
            role={textRoles?.[slotItems[editingIndex]?.id] || defaultRoleForSlot(slug, editingIndex)}
            styleOverrides={textStyles?.[slotItems[editingIndex]?.id] || {}}
            printFormat={printFormat}
            reference={{ referenceWidthPx: overlayWidthPx, referenceWidthMm: pageMetrics.contentWidthMm }}
            {...slotBoxMm(geometry[editingIndex], printFormat)}
            onSave={(payload) => {
              const existing = slotItems[editingIndex];
              if (existing) onSaveText(existing.id, payload);
              else onCreateText(editingIndex, payload);
              setEditingIndex(null);
            }}
            onCancel={() => setEditingIndex(null)}
          />
        )}
      </div>
      <AtelierPhotoLightbox url={viewingUrl} onClose={() => setViewingUrl(null)} />
    </>
  );
}

export default AtelierPageOverlay;
