// C:\Users\USER\bookfete\frontend\src\components\book\hooks\useInvitations.js
import { useState } from 'react';

export const useInvitations = () => {
  const [showInviteSelector, setShowInviteSelector] = useState(false);
  const [selectedChapterForInvite, setSelectedChapterForInvite] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  const handleOpenInviteSelector = (chapter, e) => {
    e.stopPropagation();
    
    if (!chapter || !chapter.id) {
      console.error('❌ Erreur: chapter ou chapter.id manquant');
      alert('Erreur: impossible d\'identifier le chapitre');
      return;
    }
    
    setSelectedChapterForInvite(chapter);
    setShowInviteSelector(true);
  };

  const handleInvitesSent = (chapterId) => {
    setInviteSuccess(chapterId);
    setTimeout(() => setInviteSuccess(null), 3000);
  };

  const closeInviteSelector = () => {
    setShowInviteSelector(false);
    setSelectedChapterForInvite(null);
  };

  return {
    showInviteSelector,
    selectedChapterForInvite,
    inviteSuccess,
    handleOpenInviteSelector,
    handleInvitesSent,
    closeInviteSelector
  };
};