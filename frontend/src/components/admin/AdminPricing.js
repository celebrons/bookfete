import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getPricingSettingsRemote, setPricingSettingsRemote } from '../../services/adminApi';
import './AdminEvents.css';

// Tarifs des livres (2026-10-07) — voir backend/services/pricing/pricingSettings.js.
// L'admin raisonne en EUROS (la grille est toujours calculee en euros, voir
// calculateBookPrice.js — la devise affichee au client n'est qu'une
// conversion a l'affichage) : la conversion euros<->centimes se fait
// uniquement ici, jamais au-dela de ce composant.
const FORMAT_LABELS = { livret: 'Livret', standard: 'Standard', luxe: 'Luxe' };

const centsToEuros = (cents) => (Number(cents) / 100).toFixed(2);
const eurosToCents = (euros) => Math.round(Number(String(euros).replace(',', '.')) * 100);

function AdminPricing() {
  const [reglages, setReglages] = useState(null); // { formats, pdfPriceCents, packDiscountPercent, reference }
  const [brouillon, setBrouillon] = useState(null); // memes champs, en chaines (saisie libre)
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState(false);

  const versbrouillon = (donnees) => ({
    formats: Object.fromEntries(Object.entries(donnees.formats).map(([f, v]) => [f, {
      basePrice: centsToEuros(v.basePriceCents),
      pricePer2Pages: centsToEuros(v.pricePer2PagesCents)
    }])),
    pdfPrice: centsToEuros(donnees.pdfPriceCents),
    packDiscount: String(donnees.packDiscountPercent)
  });

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');
    try {
      const donnees = await getPricingSettingsRemote();
      setReglages(donnees);
      setBrouillon(versbrouillon(donnees));
    } catch (err) {
      setErreur(err?.message || 'Lecture des tarifs impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const modifierFormat = (format, champ, valeur) => {
    setSucces(false);
    setBrouillon((prec) => ({
      ...prec,
      formats: { ...prec.formats, [format]: { ...prec.formats[format], [champ]: valeur } }
    }));
  };

  const aDesChangements = useMemo(() => {
    if (!reglages || !brouillon) return false;
    return JSON.stringify(versbrouillon(reglages)) !== JSON.stringify(brouillon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reglages, brouillon]);

  const enregistrer = async () => {
    setEnregistrement(true);
    setErreur('');
    setSucces(false);
    try {
      const payload = {
        formats: Object.fromEntries(Object.entries(brouillon.formats).map(([f, v]) => [f, {
          basePriceCents: eurosToCents(v.basePrice),
          pricePer2PagesCents: eurosToCents(v.pricePer2Pages)
        }])),
        pdfPriceCents: eurosToCents(brouillon.pdfPrice),
        packDiscountPercent: Math.round(Number(brouillon.packDiscount))
      };
      const donnees = await setPricingSettingsRemote(payload);
      setReglages(donnees);
      setBrouillon(versbrouillon(donnees));
      setSucces(true);
    } catch (err) {
      setErreur(err?.message || 'Enregistrement impossible.');
    } finally {
      setEnregistrement(false);
    }
  };

  if (chargement) return <p className="admin-state">Lecture des tarifs…</p>;
  if (!reglages || !brouillon) return <p className="admin-events-erreur">{erreur}</p>;

  return (
    <section className="admin-events">
      <div className="admin-events-head">
        <h2>Tarifs des livres</h2>
        <button type="button" className="btn btn-outline" onClick={charger} disabled={chargement || enregistrement}>
          Actualiser
        </button>
      </div>

      <p className="admin-state">
        Prix de base = au palier minimum (30 pages). "+2 pages" = supplément ajouté tous les 2 pages
        au-delà. Toujours en euros : la devise du client n'est qu'une conversion à l'affichage.
      </p>

      <div className="admin-events-table-wrap">
        <table className="admin-events-table">
          <thead>
            <tr>
              <th>Format</th>
              <th>Prix de base (30 pages)</th>
              <th>Prix / +2 pages</th>
              <th title="Coût réel payé à Gelato — information, jamais modifiable ici">Coût Gelato (référence)</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(FORMAT_LABELS).map((format) => (
              <tr key={format}>
                <td>{FORMAT_LABELS[format]}</td>
                <td>
                  <input
                    className="input-luxe"
                    style={{ width: '6rem' }}
                    type="number" step="0.01" min="0"
                    value={brouillon.formats[format].basePrice}
                    onChange={(e) => modifierFormat(format, 'basePrice', e.target.value)}
                  /> €
                </td>
                <td>
                  <input
                    className="input-luxe"
                    style={{ width: '6rem' }}
                    type="number" step="0.01" min="0"
                    value={brouillon.formats[format].pricePer2Pages}
                    onChange={(e) => modifierFormat(format, 'pricePer2Pages', e.target.value)}
                  /> €
                </td>
                <td>
                  {centsToEuros(reglages.reference[format].gelatoCostCents)} € de base,
                  {' '}+{centsToEuros(reglages.reference[format].gelatoCostPer2PagesCents)} €/+2 pages
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '1.25rem', alignItems: 'flex-end' }}>
        <label>
          Prix du PDF seul<br />
          <input
            className="input-luxe" style={{ width: '6rem' }}
            type="number" step="0.01" min="0"
            value={brouillon.pdfPrice}
            onChange={(e) => { setSucces(false); setBrouillon((p) => ({ ...p, pdfPrice: e.target.value })); }}
          /> €
        </label>
        <label>
          Remise du pack (PDF + imprimé)<br />
          <input
            className="input-luxe" style={{ width: '5rem' }}
            type="number" step="1" min="0" max="100"
            value={brouillon.packDiscount}
            onChange={(e) => { setSucces(false); setBrouillon((p) => ({ ...p, packDiscount: e.target.value })); }}
          /> %
        </label>

        <button type="button" className="btn btn-primary" onClick={enregistrer} disabled={!aDesChangements || enregistrement}>
          {enregistrement ? 'Enregistrement…' : 'Enregistrer les tarifs'}
        </button>
      </div>

      {erreur && <p className="admin-events-erreur">{erreur}</p>}
      {succes && <p className="admin-state">Tarifs enregistrés — appliqués à toute nouvelle commande immédiatement (les commandes déjà passées gardent leur propre prix, jamais recalculé).</p>}
    </section>
  );
}

export default AdminPricing;
