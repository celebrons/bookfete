import React, { useEffect, useState } from 'react';

// Fenetre d'avertissement « ces photos sont deja dans votre livre ».
//
// Remplace un window.confirm (2026-09-20). Le confirm natif etait brut au
// milieu d'un atelier soigne, il ne pouvait montrer que du texte — donc des
// NOMS DE FICHIER, la seule chose qu'on ne reconnait pas d'un coup d'oeil —
// et son bouton « OK » ne disait pas ce qu'il allait faire.
//
// Ici on montre les photos elles-memes : c'est en les voyant qu'on sait si
// c'est bien le meme dossier qu'on vient de redeposer. Les vignettes sont
// lues directement depuis les fichiers choisis (URL.createObjectURL), sans
// rien envoyer au serveur — decider ne doit rien couter.
//
// Trois sorties, chacune nommee par ce qu'elle fait :
//   - « N'ajouter que les nouvelles » : le cas courant — on redepose un
//     dossier pour y recuperer les quelques photos ajoutees depuis. Propose
//     en premier, et seulement s'il Y A des nouvelles dans la selection.
//   - « Ajouter quand meme » : tout est envoye, doublons compris. Ajouter
//     deux fois la meme photo est parfaitement legitime (deux pages, deux
//     endroits du livre) : ce n'est pas une erreur a empecher.
//   - « Annuler » : on ne fait RIEN. Aucune photo n'est ajoutee, pas meme
//     les nouvelles — c'est le seul sens honnete du mot « annuler ».
function AtelierDuplicatePhotosModal({
  isOpen,
  doublons = [],
  nombreNouvelles = 0,
  onAddNewOnly,
  onAddAnyway,
  onCancel
}) {
  const [vignettes, setVignettes] = useState([]);

  useEffect(() => {
    if (!isOpen || doublons.length === 0) {
      setVignettes([]);
      return undefined;
    }
    // Au-dela de 6, la fenetre deviendrait une grille a faire defiler pour
    // rien : le compte suffit a comprendre.
    const urls = doublons.slice(0, 6).map((fichier) => ({
      nom: fichier.name,
      url: URL.createObjectURL(fichier)
    }));
    setVignettes(urls);
    // Les URL d'objet occupent la memoire tant qu'on ne les revoque pas.
    return () => urls.forEach((entree) => URL.revokeObjectURL(entree.url));
  }, [isOpen, doublons]);

  if (!isOpen || doublons.length === 0) return null;

  const nombre = doublons.length;
  const pluriel = nombre > 1;
  const nouvelles = Math.max(0, nombreNouvelles);
  const aDesNouvelles = nouvelles > 0 && Boolean(onAddNewOnly);

  return (
    <div className="atelier-modal-backdrop" onClick={onCancel}>
      <div className="atelier-modal atelier-doublons" onClick={(event) => event.stopPropagation()}>
        <div className="atelier-modal-head">
          <h2 className="atelier-modal-title">
            {pluriel ? `Ces ${nombre} photos sont déjà dans votre livre` : 'Cette photo est déjà dans votre livre'}
          </h2>
          <button type="button" className="atelier-modal-close" onClick={onCancel} aria-label="Fermer">×</button>
        </div>

        <p className="atelier-doublons-intro">
          {pluriel ? 'Elles portent' : 'Elle porte'} le même nom et la même taille que{' '}
          {pluriel ? 'des photos déjà déposées' : 'une photo déjà déposée'}.
          {nouvelles > 0 && (
            <> Votre sélection contient aussi <strong>{nouvelles} photo{nouvelles > 1 ? 's' : ''} nouvelle{nouvelles > 1 ? 's' : ''}</strong>.</>
          )}
        </p>

        <div className="atelier-doublons-grid">
          {vignettes.map((entree) => (
            <figure key={entree.url} className="atelier-doublons-item">
              <img src={entree.url} alt="" />
              <figcaption title={entree.nom}>{entree.nom}</figcaption>
            </figure>
          ))}
          {nombre > vignettes.length && (
            <span className="atelier-doublons-reste">+{nombre - vignettes.length}</span>
          )}
        </div>

        {/* L'action mise en avant est celle qu'on veut presque toujours :
            recuperer les nouvelles sans recreer les doublons. « Ajouter
            quand meme » reste a cote, en retrait, parce que remettre deux
            fois la meme photo est un choix legitime — pas une erreur. */}
        <div className="atelier-modal-actions">
          <button type="button" className="btn btn-outline" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className={`btn ${aDesNouvelles ? 'btn-outline' : 'btn-primary'}`}
            onClick={onAddAnyway}
          >
            Ajouter quand même
          </button>
          {aDesNouvelles && (
            <button type="button" className="btn btn-primary" onClick={onAddNewOnly}>
              N’ajouter que les {nouvelles} nouvelle{nouvelles > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <p className="atelier-doublons-note">
          {aDesNouvelles
            ? '« Ajouter quand même » remet aussi les photos déjà présentes. « Annuler » n’ajoute rien du tout.'
            : '« Annuler » n’ajoute aucune photo.'}
        </p>
      </div>
    </div>
  );
}

export default AtelierDuplicatePhotosModal;
