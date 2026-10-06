import React, { useCallback, useEffect, useState } from 'react';
import { getAnalyticsSummary } from '../../services/adminApi';
import './AdminEvents.css';

// Trafic du site (2026-10-06) — voir backend/services/analytics/pageViews.js.
// Volontairement sobre : total, pages et provenances les plus visitees,
// visites par jour. Pas de graphique : a ce volume, un tableau se lit aussi
// bien et coute infiniment moins a construire/maintenir.

function AdminAnalytics() {
  const [resume, setResume] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [jours, setJours] = useState(30);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      setResume(await getAnalyticsSummary({ days: jours }));
    } catch (err) {
      setErreur(err?.message || 'Lecture du trafic impossible');
    } finally {
      setChargement(false);
    }
  }, [jours]);

  useEffect(() => { charger(); }, [charger]);

  return (
    <section className="admin-events">
      <div className="admin-events-head">
        <h2>Trafic du site</h2>
        <div className="admin-events-filtres">
          <select value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Periode">
            <option value={7}>7 derniers jours</option>
            <option value={30}>30 derniers jours</option>
            <option value={90}>90 derniers jours</option>
          </select>
          <button type="button" className="btn btn-outline" onClick={charger} disabled={chargement}>
            {chargement ? 'Chargement…' : 'Actualiser'}
          </button>
        </div>
      </div>

      {erreur && <p className="admin-events-erreur">{erreur}</p>}

      {!erreur && resume && (
        <>
          <p className="admin-state">
            <strong>{resume.total}</strong> visite{resume.total > 1 ? 's' : ''} sur les {resume.windowDays} derniers jours.
          </p>

          <div className="admin-events-table-wrap">
            <table className="admin-events-table">
              <thead><tr><th>Jour</th><th>Visites</th></tr></thead>
              <tbody>
                {resume.byDay.length === 0 && (
                  <tr><td colSpan={2}>Aucune visite sur cette période.</td></tr>
                )}
                {[...resume.byDay].reverse().map((j) => (
                  <tr key={j.date}><td>{j.date}</td><td>{j.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
            <div className="admin-events-table-wrap" style={{ flex: '1 1 320px' }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem' }}>Pages les plus visitées</h3>
              <table className="admin-events-table">
                <thead><tr><th>Page</th><th>Visites</th></tr></thead>
                <tbody>
                  {resume.topPaths.map((p) => (
                    <tr key={p.key}><td>{p.key}</td><td>{p.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-events-table-wrap" style={{ flex: '1 1 320px' }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem' }}>D'où viennent les visiteurs</h3>
              <table className="admin-events-table">
                <thead><tr><th>Provenance</th><th>Visites</th></tr></thead>
                <tbody>
                  {resume.topReferrers.map((r) => (
                    <tr key={r.key}><td>{r.key}</td><td>{r.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default AdminAnalytics;
