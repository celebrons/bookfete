import React from 'react';

const TemoignagesSection = () => {
  const temoignages = [
    {
      id: 1,
      nom: 'Sophie',
      role: 'RH',
      entreprise: 'TechCorp',
      texte: 'Nous avons offert un livre à notre collègue qui partait à la retraite. Chacun a pu ajouter sa photo et son mot, le résultat était magnifique et très émouvant !',
      note: 5
    },
    {
      id: 2,
      nom: 'Julien et Aurélie',
      role: 'Mariés',
      texte: 'Pour notre mariage, nous voulions un livre avec les messages de tous nos invités. La plateforme est super simple, et l\'IA a créé une mise en page splendide.',
      note: 5
    },
    {
      id: 3,
      nom: 'Thomas',
      role: 'Chef de projet',
      entreprise: 'Digital Agency',
      texte: 'Pour la fin d\'un projet de 2 ans, nous avons créé un livre souvenir. Toute l\'équipe a participé, c\'est devenu un véritable trésor.',
      note: 5
    }
  ];

  return (
    <section className="temoignages">
      <h2>Ils nous ont fait confiance</h2>
      <div className="temoignages-grid">
        {temoignages.map(t => (
          <div key={t.id} className="temoignage-card">
            <div className="quote">"</div>
            <p className="texte">{t.texte}</p>
            <div className="auteur">
              <strong>{t.nom}</strong>
              {t.role && <span> - {t.role}</span>}
              {t.entreprise && <span> chez {t.entreprise}</span>}
            </div>
            <div className="notes">{'⭐'.repeat(t.note)}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TemoignagesSection;