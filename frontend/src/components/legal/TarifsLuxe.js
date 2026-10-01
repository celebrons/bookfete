// Page Tarifs publique. Les prix de base (livret/standard/luxe) et la
// livraison viennent EN DIRECT de GET /orders/formats (deja la source
// utilisee par le choix de format a la creation d'un livre, voir
// CreateBookSansIA.js) — jamais un chiffre recopie qui finirait par
// mentir le jour ou la grille tarifaire bouge. Seuls l'increment par
// page (le "+X € / 2 pages") et le prix PDF/la regle du pack, plus
// stables, sont ecrits en clair ici (voir le commentaire a leur endroit).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  const { t, i18n } = useTranslation('legal');
  const priceLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
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
        <span className="label-gold">{t('common.eyebrow')}</span>
        <h1>{t('tarifs.title')}</h1>
        <p className="tarifs-intro">
          {t('tarifs.intro')}
        </p>

        {chargement && <p className="tarifs-chargement">{t('tarifs.loading')}</p>}

        <div className="tarifs-grid">
          {formats.map((format) => (
            <div key={format.formatId} className={`tarifs-card ${format.recommande ? 'is-recommended' : ''}`}>
              {format.recommande && <span className="tarifs-badge">{t('tarifs.recommended')}</span>}
              <h2>{format.nom}</h2>
              <p className="tarifs-accroche">{format.accroche}</p>
              <p className="tarifs-dims">
                {Math.round(format.widthMm / 10)} × {Math.round(format.heightMm / 10)} cm · {t('tarifs.coverLabel', { type: format.reliure === 'rigide' ? t('tarifs.rigid') : t('tarifs.flexible') })}
              </p>
              <p className="tarifs-prix">
                {formatEuros(format.startingPriceCents, 'EUR', priceLocale)}
                <span className="tarifs-prix-note">{t('tarifs.startingFrom', { count: format.minPages })}</span>
              </p>
              <p className="tarifs-increment">
                {t('tarifs.thenPer2Pages', { price: formatEuros(INCREMENT_PAR_FORMAT[format.formatId], 'EUR', priceLocale) })}
              </p>
              <p className="tarifs-livraison">
                {t('tarifs.shipping', { price: formatEuros(format.shippingPriceCents, 'EUR', priceLocale) })}
              </p>
            </div>
          ))}
        </div>

        <div className="tarifs-autres">
          <div className="tarifs-autre-item">
            <h3>{t('tarifs.pdfOnly')}</h3>
            <p className="tarifs-autre-prix">{formatEuros(PDF_PRICE_CENTS, 'EUR', priceLocale)}</p>
            <p>{t('tarifs.pdfOnlyDescription')}</p>
          </div>
          <div className="tarifs-autre-item">
            <h3>{t('tarifs.pack')}</h3>
            <p className="tarifs-autre-prix">−10 %</p>
            <p>{t('tarifs.packDescription')}</p>
          </div>
        </div>

        <p className="tarifs-note">
          {t('tarifs.vatNote')}
        </p>

        <Link to="/create-book" className="btn btn-primary tarifs-cta">{t('tarifs.cta')}</Link>
      </div>
    </div>
  );
}
