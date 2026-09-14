import React, { useCallback, useEffect, useRef, useState } from 'react';
import './AddressAutocomplete.css';

// Saisie d'adresse avec suggestions, partagee par la commande
// (checkout/StepAddress.js) et les parametres du compte
// (account/AccountSpaceLuxe.js) — une seule implementation, pour que les deux
// ecrans se comportent exactement pareil.
//
// Source : la Base Adresse Nationale (api-adresse.data.gouv.fr), service
// public francais, gratuit, sans cle ni compte, et qui autorise les appels
// depuis le navigateur. Choisie plutot qu'un service commercial (Google
// Places, Algolia) precisement parce qu'elle n'exige aucun secret a
// distribuer dans le code du navigateur ni aucune facturation a surveiller.
//
// TROIS REGLES DE PRUDENCE, dans l'ordre d'importance :
//
//   1. JAMAIS BLOQUANT. Le service peut etre lent, indisponible, ou renvoyer
//      n'importe quoi : dans tous ces cas la saisie libre continue de
//      fonctionner exactement comme avant. Aucune erreur affichee, aucun
//      champ desactive, aucune validation qui depende de la reponse. C'est
//      une aide a la frappe, pas une source de verite — c'est le backend
//      (sanitizeAddress/isAddressValid) qui reste l'autorite.
//   2. FRANCE UNIQUEMENT. La BAN ne connait que la France ; des que le pays
//      n'est pas la France, les suggestions se taisent plutot que de proposer
//      des resultats faux.
//   3. RIEN N'EST ENVOYE SANS FRAPPE. La requete ne part qu'a partir de 3
//      caracteres saisis et apres une pause — on n'envoie pas la moitie d'une
//      adresse a chaque touche.
//
// Le champ reste un <input> ordinaire, controle par le parent via
// `onChangeField` (meme signature d'evenement que les champs voisins) :
// choisir une suggestion emet simplement plusieurs evenements de changement,
// un par champ rempli.

const BAN_URL = 'https://api-adresse.data.gouv.fr/search/';
const MIN_CHARS = 3;
const DEBOUNCE_MS = 280;
const MAX_SUGGESTIONS = 5;

const estFrance = (pays) => {
  const valeur = String(pays || '').trim().toLowerCase();
  return valeur === '' || valeur === 'france' || valeur === 'fr';
};

function AddressAutocomplete({
  // Champ pilote : 'line1' (rue) ou 'postalCode' (code postal). Les deux
  // remplissent les memes champs, seule la requete change.
  field,
  value,
  address,
  onChangeField,
  placeholder,
  disabled,
  className = 'input-luxe'
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [surligne, setSurligne] = useState(-1);
  const conteneurRef = useRef(null);
  // Jeton de requete : seule la DERNIERE frappe a le droit d'afficher ses
  // resultats. Sans ca, une reponse lente partie il y a trois lettres pouvait
  // ecraser les suggestions de la frappe courante.
  const jetonRef = useRef(0);

  const fermer = useCallback(() => { setOuvert(false); setSurligne(-1); }, []);

  // Clic a l'exterieur : referme la liste sans rien choisir.
  useEffect(() => {
    if (!ouvert) return undefined;
    const surClicExterieur = (event) => {
      if (conteneurRef.current && !conteneurRef.current.contains(event.target)) fermer();
    };
    document.addEventListener('mousedown', surClicExterieur);
    return () => document.removeEventListener('mousedown', surClicExterieur);
  }, [ouvert, fermer]);

  useEffect(() => {
    const saisie = String(value || '').trim();
    if (disabled || !estFrance(address?.country) || saisie.length < MIN_CHARS) {
      setSuggestions([]);
      return undefined;
    }

    const jeton = jetonRef.current + 1;
    jetonRef.current = jeton;
    const controleur = new AbortController();

    const minuteur = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: saisie, limit: String(MAX_SUGGESTIONS) });
        // Le code postal interroge les COMMUNES (une ville par resultat), la
        // rue interroge les adresses completes : deux besoins differents,
        // deux types de resultats.
        params.set('type', field === 'postalCode' ? 'municipality' : 'housenumber');
        if (field !== 'postalCode' && address?.postalCode) {
          params.set('postcode', String(address.postalCode).trim());
        }

        const reponse = await fetch(`${BAN_URL}?${params.toString()}`, { signal: controleur.signal });
        if (!reponse.ok) throw new Error(String(reponse.status));
        const json = await reponse.json();
        if (jeton !== jetonRef.current) return; // une frappe plus recente a pris la main

        const trouvees = (Array.isArray(json?.features) ? json.features : [])
          .map((feature) => feature?.properties)
          .filter((p) => p && p.label)
          .slice(0, MAX_SUGGESTIONS);
        setSuggestions(trouvees);
        setOuvert(trouvees.length > 0);
        setSurligne(-1);
      } catch (_error) {
        // Silencieux par construction (regle n°1) : la saisie libre continue.
        if (jeton === jetonRef.current) setSuggestions([]);
      }
    }, DEBOUNCE_MS);

    return () => { clearTimeout(minuteur); controleur.abort(); };
  }, [value, field, address?.country, address?.postalCode, disabled]);

  // Choisir une suggestion remplit TOUS les champs qu'elle renseigne, pas
  // seulement celui ou l'on tape : c'est tout l'interet (taper la rue remplit
  // le code postal et la ville, et inversement).
  const choisir = (proposition) => {
    const emettre = (name, valeur) => {
      if (valeur === undefined || valeur === null || valeur === '') return;
      onChangeField({ target: { name, value: String(valeur) } });
    };
    if (field === 'postalCode') {
      emettre('postalCode', proposition.postcode);
      emettre('city', proposition.city || proposition.name);
    } else {
      // `name` = numero + rue ; `label` contiendrait aussi le code postal et
      // la ville, qui ont deja leurs propres champs.
      emettre('line1', proposition.name || proposition.label);
      emettre('postalCode', proposition.postcode);
      emettre('city', proposition.city);
    }
    fermer();
  };

  const surTouche = (event) => {
    if (!ouvert || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSurligne((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSurligne((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter' && surligne >= 0) {
      event.preventDefault();
      choisir(suggestions[surligne]);
    } else if (event.key === 'Escape') {
      fermer();
    }
  };

  return (
    <div className="adresse-auto" ref={conteneurRef}>
      <input
        className={className}
        name={field}
        value={value || ''}
        onChange={onChangeField}
        onKeyDown={surTouche}
        onFocus={() => suggestions.length > 0 && setOuvert(true)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {ouvert && suggestions.length > 0 && (
        <ul className="adresse-auto-liste">
          {suggestions.map((proposition, index) => (
            <li key={`${proposition.id || proposition.label}-${index}`}>
              <button
                type="button"
                className={`adresse-auto-option ${index === surligne ? 'is-active' : ''}`}
                // onMouseDown, pas onClick : le clic ferait d'abord perdre le
                // focus au champ, et la liste disparaitrait avant le clic.
                onMouseDown={(event) => { event.preventDefault(); choisir(proposition); }}
              >
                {proposition.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AddressAutocomplete;
