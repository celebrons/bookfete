// Page Tarifs publique. Les prix de base (livret/standard/luxe) et la
// livraison viennent EN DIRECT de GET /orders/formats (deja la source
// utilisee par le choix de format a la creation d'un livre, voir
// CreateBookSansIA.js) — jamais un chiffre recopie qui finirait par
// mentir le jour ou la grille tarifaire bouge. Seuls l'increment par
// page (le "+X € / 2 pages") et le prix PDF/la regle du pack, plus
// stables, sont ecrits en clair ici (voir le commentaire a leur endroit).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPrintFormats } from '../../services/ordersApi';
import { formatPriceCents as formatEuros } from '../../utils/orderWorkflow';
import '../../styles/luxe-theme.css';
import './TarifsLuxe.css';

// Increment par tranche de 2 pages : backend/services/pricing/pricingConfig.js
// (PRICING_CONFIG.<format>.pricePer2PagesCents) — pas expose par
// GET /orders/formats aujourd'hui, donc repris ici. A resynchroniser si ce
// fichier bouge (mis a jour pour la derniere fois le 2026-09-28).
const INCREMENT_PAR_FORMAT = { livret: 190, standard: 220, luxe: 290 };
const PDF_PRICE_CENTS = 799;

export default function TarifsLuxe() {
  const [formats, setFormats] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;
    listPrintFormats()
      .then((data) => { if (!annule) setFormats(data?.formats || []); })
      .catch(() => {})
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, []);

  return (
    <div className="tarifs-page">
      <div className="container-luxe tarifs-inner">
        <span className="label-gold">CÉLÉBRONS</span>
        <h1>Nos tarifs</h1>
        <p className="tarifs-intro">
          Le prix affiché ici est exactement celui que vous verrez dans l'atelier — jamais une estimation.
          Il dépend du format choisi et du nombre de pages de votre livre (30 pages minimum).
        </p>

        {chargement && <p className="tarifs-chargement">Chargement des tarifs…</p>}

        <div className="tarifs-grid">
          {formats.map((format) => (
            <div key={format.formatId} className={`tarifs-card ${format.recommande ? 'is-recommended' : ''}`}>
              {format.recommande && <span className="tarifs-badge">★ Recommandé</span>}
              <h2>{format.nom}</h2>
              <p className="tarifs-accroche">{format.accroche}</p>
              <p className="tarifs-dims">
                {Math.round(format.widthMm / 10)} × {Math.round(format.heightMm / 10)} cm · Couverture {format.reliure === 'rigide' ? 'rigide' : 'souple'}
              </p>
              <p className="tarifs-prix">
                {formatEuros(format.startingPriceCents)}
                <span className="tarifs-prix-note">à partir de {format.minPages} pages</span>
              </p>
              <p className="tarifs-increment">
                puis {formatEuros(INCREMENT_PAR_FORMAT[format.formatId])} toutes les 2 pages supplémentaires
              </p>
              <p className="tarifs-livraison">
                Livraison (France) : {formatEuros(format.shippingPriceCents)}
              </p>
            </div>
          ))}
        </div>

        <div className="tarifs-autres">
          <div className="tarifs-autre-item">
            <h3>PDF seul</h3>
            <p className="tarifs-autre-prix">{formatEuros(PDF_PRICE_CENTS)}</p>
            <p>Fichier PDF haute définition, téléchargeable dès le paiement. Aucune livraison.</p>
          </div>
          <div className="tarifs-autre-item">
            <h3>Pack PDF + imprimé</h3>
            <p className="tarifs-autre-prix">−10 %</p>
            <p>Le prix du PDF et celui du livre imprimé, additionnés puis réduits de 10 % — plus la livraison.</p>
          </div>
        </div>

        <p className="tarifs-note">
          Tous nos prix sont exprimés toutes taxes comprises. Célébrons exerçant sous le statut de
          micro-entreprise, la TVA n'est pas applicable (article 293 B du Code général des impôts).
        </p>

        <Link to="/create-book" className="btn btn-primary tarifs-cta">Créer mon livre</Link>
      </div>
    </div>
  );
}
