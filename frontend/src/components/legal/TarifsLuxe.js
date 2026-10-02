// Page Tarifs publique. TOUT vient EN DIRECT de GET /orders/formats (deja
// la source utilisee par le choix de format a la creation d'un livre, voir
// CreateBookSansIA.js) — jamais un chiffre recopie qui finirait par mentir
// le jour ou la grille tarifaire (ou le pays de livraison) change.
// L'increment par page et le prix du PDF etaient autrefois recopies ici en
// dur (EUR uniquement) ; exposes par l'API depuis le chantier international
// (2026-10-02) pour ne plus avoir cette duplication a resynchroniser a la
// main — et pour qu'ils apparaissent dans la bonne devise.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listPrintFormats } from '../../services/ordersApi';
import { formatPriceCents } from '../../utils/orderWorkflow';
import '../../styles/luxe-theme.css';
import './TarifsLuxe.css';

export default function TarifsLuxe() {
  const { t, i18n } = useTranslation('legal');
  const priceLocale = i18n.language === 'en' ? 'en-US' : 'fr-FR';
  const [formats, setFormats] = useState([]);
  const [pdfPriceCents, setPdfPriceCents] = useState(0);
  const [currency, setCurrency] = useState('EUR');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;
    const charger = () => {
      setChargement(true);
      listPrintFormats()
        .then((data) => {
          if (annule) return;
          setFormats(data?.formats || []);
          setPdfPriceCents(data?.pdfPriceCents || 0);
          setCurrency(data?.currency || 'EUR');
        })
        .catch(() => {})
        .finally(() => { if (!annule) setChargement(false); });
    };
    charger();
    // Le pays peut changer APRES le premier chargement (selecteur dans
    // l'en-tete, voir CountrySwitcher.js) — on redemande alors les tarifs
    // dans la nouvelle devise plutot que de laisser l'ancienne affichee.
    const onCountryChange = () => charger();
    window.addEventListener('celebrons:country-changed', onCountryChange);
    return () => {
      annule = true;
      window.removeEventListener('celebrons:country-changed', onCountryChange);
    };
  }, []);

  const formatPrix = (cents) => formatPriceCents(cents, currency, priceLocale);

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
                {formatPrix(format.startingPriceCents)}
                <span className="tarifs-prix-note">{t('tarifs.startingFrom', { count: format.minPages })}</span>
              </p>
              <p className="tarifs-increment">
                {t('tarifs.thenPer2Pages', { price: formatPrix(format.pricePer2PagesCents) })}
              </p>
              <p className="tarifs-livraison">
                {t('tarifs.shipping', { price: formatPrix(format.shippingPriceCents) })}
              </p>
            </div>
          ))}
        </div>

        <div className="tarifs-autres">
          <div className="tarifs-autre-item">
            <h3>{t('tarifs.pdfOnly')}</h3>
            <p className="tarifs-autre-prix">{formatPrix(pdfPriceCents)}</p>
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
