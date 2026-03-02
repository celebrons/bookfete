// C:\Users\USER\bookfete\frontend\src\components\book\hooks\useContributions.js
import { useState } from 'react';
import { supabase } from '../../../services/supabaseClient';

const CHAPTER_STATE_EMAIL = '__chapter_state__@system.local';

export const useContributions = () => {
  const [showContributions, setShowContributions] = useState(false);
  const [chapterContributions, setChapterContributions] = useState([]);
  const [loadingContributions, setLoadingContributions] = useState(false);
  
  // États pour les contributions personnelles
  const [contributionText, setContributionText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [uploadedPhotoUrls, setUploadedPhotoUrls] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const loadContributions = async (chapterId) => {
    setLoadingContributions(true);
    try {
      const { data, error } = await supabase
        .from('contributions')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const visibleContributions = (data || []).filter(
        (contribution) =>
          contribution.is_finalized !== false &&
          contribution.contributor_email !== CHAPTER_STATE_EMAIL
      );
      setChapterContributions(visibleContributions);
      setShowContributions(true);
    } catch (error) {
      console.error('❌ Erreur chargement contributions:', error);
      alert('Erreur lors du chargement des contributions');
    } finally {
      setLoadingContributions(false);
    }
  };

  const approveContribution = async (contributionId) => {
    try {
      const { error } = await supabase
        .from('contributions')
        .update({ approved: true })
        .eq('id', contributionId);

      if (error) throw error;

      setChapterContributions(prev =>
        prev.map(c => c.id === contributionId ? { ...c, approved: true } : c)
      );
    } catch (error) {
      console.error('❌ Erreur approbation:', error);
      alert('Erreur lors de l\'approbation');
    }
  };

  const deleteContribution = async (contributionId) => {
    if (!window.confirm('Supprimer cette contribution ?')) return;

    try {
      const { error } = await supabase
        .from('contributions')
        .delete()
        .eq('id', contributionId);

      if (error) throw error;

      setChapterContributions(prev => prev.filter(c => c.id !== contributionId));
    } catch (error) {
      console.error('❌ Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // Upload une photo immédiatement
  const uploadPhotoImmediately = async (file, chapterId) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${chapterId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('contribution-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('contribution-photos')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('❌ Erreur upload:', error);
      return null;
    }
  };

  // Gestion des photos
  const handlePhotoChange = async (e, chapterId) => {
    const files = Array.from(e.target.files);
    
    if (uploadedPhotoUrls.length + files.length > 2) {
      alert('Maximum 2 photos');
      return;
    }

    const validFiles = files.filter(file => {
      const isValid = file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024;
      if (!isValid) alert(`${file.name} : format invalide ou trop volumineux (max 5MB)`);
      return isValid;
    });

    // Upload chaque photo immédiatement
    const newUrls = [];
    for (const file of validFiles) {
      const url = await uploadPhotoImmediately(file, chapterId);
      if (url) {
        newUrls.push(url);
        
        // Ajouter la preview
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotoPreviews(prev => [...prev, reader.result]);
        };
        reader.readAsDataURL(file);
      }
    }

    setUploadedPhotoUrls(prev => [...prev, ...newUrls]);
    setPhotos(prev => [...prev, ...validFiles]);
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
    setUploadedPhotoUrls(prev => prev.filter((_, i) => i !== index));
  };

  const submitContribution = async (chapterId, userEmail, userName) => {
    if (!contributionText.trim()) {
      alert('Veuillez écrire un message');
      return false;
    }

    setSubmitting(true);
    try {
      const photoUrls = uploadedPhotoUrls;
      
      const { data, error } = await supabase
        .from('contributions')
        .insert([{
          chapter_id: chapterId,
          contributor_name: userName,
          contributor_email: userEmail,
          message: contributionText,
          photo_urls: photoUrls,
          approved: false,
          is_finalized: false
        }])
        .select()
        .single();

      if (error) throw error;

      return data.id;
      
    } catch (error) {
      console.error('❌ Erreur:', error);
      alert('Erreur lors de l\'envoi');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    showContributions,
    setShowContributions,
    chapterContributions,
    loadingContributions,
    contributionText,
    setContributionText,
    photos,
    photoPreviews,
    uploadedPhotoUrls,
    submitting,
    loadContributions,
    approveContribution,
    deleteContribution,
    handlePhotoChange,
    removePhoto,
    submitContribution
  };
};
