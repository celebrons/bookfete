import React, { useState } from 'react';
import QuestionGenerator from '../components/chapters/QuestionGenerator';

const EditChapterPage = () => {
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterDescription, setChapterDescription] = useState('');
  const [chapterQuestions, setChapterQuestions] = useState([]);

  const handleQuestionsGenerated = (questions) => {
    // Soit vous ajoutez aux questions existantes
    setChapterQuestions([...chapterQuestions, ...questions]);
    
    // Soit vous remplacez
    // setChapterQuestions(questions);
    
    // Et vous pouvez sauvegarder en base
    saveQuestionsToDatabase(questions);
  };

  const saveQuestionsToDatabase = async (questions) => {
    // Votre logique de sauvegarde existante
    console.log('Questions à sauvegarder:', questions);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Éditer le chapitre</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne principale - Édition du chapitre */}
        <div className="lg:col-span-2 space-y-4">
          <input
            type="text"
            placeholder="Titre du chapitre"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            className="w-full p-2 border rounded"
          />
          
          <textarea
            placeholder="Description du chapitre (optionnel)"
            value={chapterDescription}
            onChange={(e) => setChapterDescription(e.target.value)}
            rows="4"
            className="w-full p-2 border rounded"
          />
          
          {/* Liste des questions existantes */}
          {chapterQuestions.map((question, index) => (
            <div key={index} className="p-3 bg-gray-50 rounded">
              {question}
            </div>
          ))}
        </div>

        {/* Colonne latérale - Générateur IA */}
        <div className="lg:col-span-1">
          <QuestionGenerator
            chapterTitle={chapterTitle}
            chapterDescription={chapterDescription}
            onQuestionsGenerated={handleQuestionsGenerated}
          />
        </div>
      </div>
    </div>
  );
};

export default EditChapterPage;