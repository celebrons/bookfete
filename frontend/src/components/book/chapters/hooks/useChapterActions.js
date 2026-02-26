// C:\Users\USER\bookfete\frontend\src\components\book\chapters\hooks\useChapterActions.js
import { useState } from 'react';
import { supabase } from '../../../../services/supabaseClient';

export const useChapterActions = (bookId, onUpdateChapter, setSelectedItem) => {
  const [editingChapter, setEditingChapter] = useState(null);
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleEdit = (chapter) => {
    setEditingChapter({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description || ''
    });
  };

  const handleEditQuestions = (chapter) => {
    setEditingQuestions({
      id: chapter.id,
      questions: chapter.questions_ia || []
    });
  };

  const handleDeleteClick = (chapter, e) => {
    e.stopPropagation();
    setDeleteConfirm(chapter);
  };

  const handleSaveEdit = async () => {
    if (editingChapter) {
      await onUpdateChapter(editingChapter.id, {
        title: editingChapter.title,
        description: editingChapter.description
      });
      setEditingChapter(null);
    }
  };

  const handleSaveQuestions = async () => {
    if (editingQuestions) {
      await onUpdateChapter(editingQuestions.id, {
        questions_ia: editingQuestions.questions
      });
      setEditingQuestions(null);
    }
  };

  // ==================== FONCTION IA ====================
  const generateAIQuestions = async (chapter) => {
    try {
      setGeneratingQuestions(true);
      
      // Récupération des données du livre
      const { data: bookData, error } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();
      
      if (error) throw error;

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      if (!token) {
        alert('Vous devez être connecté');
        return;
      }

      console.log('📤 Envoi à l\'API avec:', {
        chapterTitle: chapter.title,
        bookTitle: bookData.title,
        recipientName: bookData.recipient_name,
        recipientAge: bookData.recipient_age,
        recipientGender: bookData.recipient_gender
      });

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

      // 🔥 Mettre à jour le chapitre dans la base
      await onUpdateChapter(chapter.id, {
        questions_ia: data.questions
      });

      // 🔥 Mettre à jour l'élément sélectionné
      if (setSelectedItem) {
        setSelectedItem(prev => ({
          ...prev,
          questions_ia: data.questions
        }));
      }

      // 🔥 Recharger les données du chapitre pour être sûr
      const { data: refreshedChapter } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', chapter.id)
        .single();

      if (refreshedChapter && setSelectedItem) {
        setSelectedItem(refreshedChapter);
      }

      return data.questions;
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      alert('Erreur lors de la génération des questions');
    } finally {
      setGeneratingQuestions(false);
    }
  };

  return {
    editingChapter,
    editingQuestions,
    generatingQuestions,
    deleteConfirm,
    setEditingChapter,
    setEditingQuestions,
    setDeleteConfirm,
    handleEdit,
    handleEditQuestions,
    handleDeleteClick,
    handleSaveEdit,
    handleSaveQuestions,
    generateAIQuestions
  };
};