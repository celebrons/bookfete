// Sortie IA fixe au format attendu par promptEngine.parseChapterBodyBlocks.
// Externalisee dans une fixture pour etre requise depuis une factory jest.mock
// (le hoisting interdit de referencer des variables du fichier de test).

const AI_CHAPTER_BODY_OUTPUT = `[OUVERTURE]
La cuisine sentait le cumin et le pain chaud bien avant que quiconque descende l'escalier. Marguerite y regnait sans jamais elever la voix, le grand plat bleu deja pose au centre de la table.

[CORPS]
Le dimanche, la radio restait allumee sur la meme station. Personne n'avait choisi cette habitude, elle s'etait installee toute seule, comme les places autour de la table. Sophie se souvient des feuilles de brick ratees, douze avant la premiere reussie, et du rire de Marguerite qui remplissait la piece.

Karim, lui, n'a jamais eu droit a son prenom. Il etait le grand, et il l'est reste trente ans plus tard. Ces surnoms tenaient lieu de tendresse chez elle, une facon de dire les choses sans les dire.

Il y avait aussi les disputes, courtes et bruyantes, qui s'achevaient toujours par une assiette supplementaire tendue a celui qui boudait. Elle ne s'excusait jamais avec des mots, seulement avec du pain trempe dans la sauce.

Les etes changeaient le rythme sans changer le rituel. On mangeait dehors, la radio passait par la fenetre, et le grand plat bleu suivait sur la table de jardin.

[CODA]
Aujourd'hui encore, quand la radio joue cette station, quelqu'un dans la famille se leve pour mettre la table sans qu'on le lui demande.`;

const PROMPT_TEMPLATE_STUB = {
  id: 'tpl-chapter-body-1',
  version: 7,
  type: 'chapter_body',
  status: 'published'
};

module.exports = { AI_CHAPTER_BODY_OUTPUT, PROMPT_TEMPLATE_STUB };
