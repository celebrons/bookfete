// C:\Users\USER\bookfete\frontend\src\components\book\hooks\useQuestions.js
import { useState } from 'react';
import { supabase } from '../../../services/supabaseClient';

export const useQuestions = (onUpdateChapter, setSelectedChapter) => {
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

  console.log('🔵 useQuestions initialisé avec onUpdateChapter:', !!onUpdateChapter);

  const handleEditQuestions = (chapter) => {
    console.log('📝 ===== handleEditQuestions =====');
    console.log('📝 chapter reçu:', chapter?.title);
    console.log('📝 chapter ID:', chapter?.id);
    console.log('📝 questions actuelles:', chapter?.questions_ia);
    
    setEditingQuestions({
      id: chapter.id,
      questions: chapter.questions_ia || []
    });
  };

  const handleSaveQuestions = async () => {
    if (editingQuestions) {
      try {
        console.log('💾 Sauvegarde des questions:', editingQuestions.questions);
        await onUpdateChapter(editingQuestions.id, {
          questions_ia: editingQuestions.questions
        });
        
        // ✅ Mettre à jour selectedChapter
        if (setSelectedChapter) {
          setSelectedChapter(prev => ({
            ...prev,
            questions_ia: editingQuestions.questions
          }));
        }
        
        console.log('💾 Sauvegarde réussie');
        setEditingQuestions(null);
        return true;
      } catch (error) {
        console.error('❌ Erreur sauvegarde questions:', error);
        alert('Erreur lors de la sauvegarde des questions');
        return false;
      }
    }
  };

  const addQuestion = () => {
    if (newQuestion.trim() && editingQuestions) {
      setEditingQuestions({
        ...editingQuestions,
        questions: [...editingQuestions.questions, newQuestion.trim()]
      });
      setNewQuestion('');
    }
  };

  const removeQuestion = (index) => {
    if (editingQuestions) {
      const newQuestions = editingQuestions.questions.filter((_, i) => i !== index);
      setEditingQuestions({
        ...editingQuestions,
        questions: newQuestions
      });
    }
  };

  const generateAIQuestions = async (chapter, bookId, selectedChapter) => {
    console.log('🤖 ===== generateAIQuestions =====');
    console.log('🤖 chapter:', chapter?.title);
    
    try {
      setGeneratingQuestions(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        alert('Vous devez être connecté');
        return;
      }

      const { data: bookData, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();
      
      if (error) throw error;

      const response = await fetch(`${process.env.REACT_APP_API_URL}/ai/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chapterTitle: chapter.title,
          bookTitle: bookData.title,
          eventType: bookData.event_type || 'default',
          style: bookData.style_narratif || 'factuel',
          recipientName: bookData.recipient_name,
          recipientAge: bookData.recipient_age,
          recipientGender: bookData.recipient_gender
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur génération IA');
      }

      console.log('✅ Nouvelles questions générées:', data.questions);

      await onUpdateChapter(chapter.id, {
        questions_ia: data.questions
      });

      return data.questions;
      
    } catch (error) {
      console.error('❌ Erreur dans generateAIQuestions:', error);
      alert('Erreur lors de la génération des questions');
    } finally {
      setGeneratingQuestions(false);
    }
  };

  return {
    editingQuestions,
    setEditingQuestions,
    newQuestion,
    setNewQuestion,
    generatingQuestions,
    handleEditQuestions,
    handleSaveQuestions,
    addQuestion,
    removeQuestion,
    generateAIQuestions
  };
};