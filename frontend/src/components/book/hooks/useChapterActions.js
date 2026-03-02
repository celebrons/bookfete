// C:\Users\USER\bookfete\frontend\src\components\book\hooks\useChapterActions.js
import { useState } from 'react';

export const useChapterActions = (onUpdateChapter, onDeleteChapter) => {
  const [editingChapter, setEditingChapter] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedChapterId, setSelectedChapterId] = useState(null);

  const handleSelectChapter = (chapterId) => {
    setSelectedChapterId(chapterId);
    setEditingChapter(null);
    setDeleteConfirm(null);
  };

  const handleEdit = (chapter) => {
    setEditingChapter({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description || ''
    });
  };

  const handleSaveEdit = async () => {
    if (editingChapter) {
      try {
        await onUpdateChapter(editingChapter.id, {
          title: editingChapter.title,
          description: editingChapter.description
        });
        setEditingChapter(null);
        return true;
      } catch (error) {
        console.error('❌ Erreur sauvegarde:', error);
        alert('Erreur lors de la sauvegarde');
        return false;
      }
    }
  };

  const handleDeleteClick = (chapter, e) => {
    e.stopPropagation();
    setDeleteConfirm(chapter);
  };

  const confirmDelete = async () => {
    if (deleteConfirm) {
      try {
        await onDeleteChapter(deleteConfirm.id);
        if (selectedChapterId === deleteConfirm.id) {
          setSelectedChapterId(null);
        }
        setDeleteConfirm(null);
        return true;
      } catch (error) {
        console.error('❌ Erreur suppression:', error);
        alert('Erreur lors de la suppression');
        return false;
      }
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm(null);
  };

  return {
    selectedChapterId,
    editingChapter,
    deleteConfirm,
    setEditingChapter,
    setSelectedChapterId,
    handleSelectChapter,
    handleEdit,
    handleSaveEdit,
    handleDeleteClick,
    confirmDelete,
    cancelDelete
  };
};
