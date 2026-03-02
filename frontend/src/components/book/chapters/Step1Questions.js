// C:\Users\USER\bookfete\frontend\src\components\book\chapters\Step1Questions.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/supabaseClient';
import Tooltip from '../../ui/Tooltip';
import '../BookLuxe.css';

const Step1Questions = ({ 
  chapter, 
  onUpdateChapter,
  user,
  book
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingQuestions, setEditingQuestions] = useState(null);
  const [newQuestion, setNewQuestion] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [localQuestions, setLocalQuestions] = useState(chapter?.questions_ia || []);
  
  // Utilise chapter.questions_validated directement
  const isValidated = chapter?.questions_validated || false;
  const isOrganizer = user && book && user.id === book.owner_id;

  // Mettre à jour l'état local quand le chapitre change
  useEffect(() => {
    setLocalQuestions(chapter?.questions_ia || []);
  }, [chapter?.questions_ia]);

  // ==================== GÉNÉRATION IA ====================
  const generateAIQuestions = async () => {
    try {
      setGenerating(true);
      setError('');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Non connecté');
      }

      const response = await fetch('http://localhost:5000/api/ai/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          chapterTitle: chapter.title,
          bookTitle: book.title,
          eventType: book.event_type || 'default',
          style: book.style_narratif || 'factuel',
          recipientName: book.recipient_name,
          recipientAge: book.recipient_age,
          recipientGender: book.recipient_gender
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Erreur ${response.status}: ${text}`);
      }

      const data = await response.json();
      
      if (!data.questions) {
        throw new Error('Réponse invalide');
      }

      if (onUpdateChapter) {
        await onUpdateChapter(chapter.id, {
          questions_ia: data.questions
        });
        setLocalQuestions(data.questions);
      }

    } catch (error) {
      setError(error.message);
    } finally {
      setGenerating(false);
    }
  };

  // ==================== ÉDITION ====================
  const handleEdit = () => {
    setEditingQuestions({
      id: chapter.id,
      questions: localQuestions
    });
    setIsEditing(true);
  };

  const handleSaveQuestions = async () => {
    if (!editingQuestions) return;
    
    setSaving(true);
    setError('');
    
    try {
      if (onUpdateChapter) {
        await onUpdateChapter(editingQuestions.id, {
          questions_ia: editingQuestions.questions
        });
        setLocalQuestions(editingQuestions.questions);
        setIsEditing(false);
        setEditingQuestions(null);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = () => {
    if (newQuestion.trim() && editingQuestions) {
      const updatedQuestions = [...editingQuestions.questions, newQuestion.trim()];
      setEditingQuestions({
        ...editingQuestions,
        questions: updatedQuestions
      });
      setNewQuestion('');
    }
  };

  const handleRemoveQuestion = (index) => {
    if (editingQuestions) {
      const updatedQuestions = editingQuestions.questions.filter((_, i) => i !== index);
      setEditingQuestions({
        ...editingQuestions,
        questions: updatedQuestions
      });
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingQuestions(null);
    setNewQuestion('');
  };

  // ==================== VALIDATION ====================
  const handleValidate = async () => {
    try {
      setError('');
      await onUpdateChapter(chapter.id, { questions_validated: true });
    } catch (error) {
      setError(error.message);
    }
  };

  // ==================== MODE ÉDITION ====================
  if (isEditing && editingQuestions) {
    return (
      <div className="card" style={{ padding: 'var(--space-xl)' }}>
        <h3 style={{ margin: '0 0 var(--space-lg)', fontSize: '18px', fontWeight: '600' }}>
          Modifier les questions
        </h3>
        
        {error && (
          <div style={{ color: '#dc3545', marginBottom: '15px' }}>❌ {error}</div>
        )}
        
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <span className="label-gold">Questions actuelles</span>
          <div style={{ marginTop: 'var(--space-sm)' }}>
            {editingQuestions.questions.map((q, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  marginBottom: 'var(--space-xs)',
                  padding: 'var(--space-sm)',
                  background: 'var(--silk)',
                  borderRadius: 'var(--radius)'
                }}
              >
                <span style={{ flex: 1, fontSize: '14px' }}>{q}</span>
                <button
                  onClick={() => handleRemoveQuestion(idx)}
                  className="btn-outline"
                  style={{
                    padding: '2px 8px',
                    borderColor: '#dc3545',
                    color: '#dc3545'
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <span className="label-gold">Ajouter une question</span>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-xs)' }}>
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              className="input-luxe"
              placeholder="Nouvelle question"
            />
            <button
              onClick={handleAddQuestion}
              className="btn btn-primary"
              style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
            >
              Ajouter
            </button>
          </div>
        </div>
        
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button onClick={handleCancel} className="modal-btn modal-btn-secondary" disabled={saving}>
            Annuler
          </button>
          <button onClick={handleSaveQuestions} className="modal-btn modal-btn-primary" disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer les questions'}
          </button>
        </div>
      </div>
    );
  }

  // ==================== MODE VISUALISATION ====================
  return (
    <div className={`questions-section ${isValidated ? 'validated' : ''}`}>
      <div className="questions-header">
        <h3>
          {isValidated 
            ? '✅ QUESTIONS VALIDÉES' 
            : '✨ QUESTIONS POUR LES CONTRIBUTEURS'}
        </h3>
        <Tooltip text="Ces questions seront envoyées aux invités pour les guider dans leur contribution">
          <span style={{ color: 'var(--gold)', cursor: 'help' }}>ⓘ</span>
        </Tooltip>
      </div>
      
      {error && (
        <div style={{ color: '#dc3545', marginBottom: '15px' }}>❌ {error}</div>
      )}
      
      <ul className="questions-list">
        {localQuestions.length > 0 ? (
          localQuestions.map((q, idx) => (
            <li key={idx}>{q}</li>
          ))
        ) : (
          <li style={{ fontStyle: 'italic' }}>Aucune question pour l'instant</li>
        )}
      </ul>

      <p className="questions-info">
        {isValidated 
          ? '✓ Ces questions sont validées et seront envoyées aux invités.'
          : 'Ces questions seront envoyées aux invités pour les guider dans leur contribution.'}
      </p>

      {isOrganizer && !isValidated && (
        <div className="questions-actions">
          <button
            onClick={generateAIQuestions}
            disabled={generating}
            className="btn btn-outline"
            style={{ flex: 1 }}
          >
            {generating ? 'Génération...' : '🎲 Regénérer'}
          </button>
          
          <button
            onClick={handleEdit}
            className="btn btn-outline"
            style={{ flex: 1 }}
          >
            ✏️ Modifier/Ajouter
          </button>

          <button
            onClick={handleValidate}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            ✅ Valider
          </button>
        </div>
      )}

      {isValidated && (
        <div className="validated-badge" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-xs)',
          padding: 'var(--space-md)',
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: 'var(--radius)',
          color: '#28a745',
          marginTop: 'var(--space-md)'
        }}>
          <span style={{ fontSize: '20px' }}>✅</span>
          <span style={{ fontWeight: '600' }}>Questions validées</span>
        </div>
      )}

      {!isOrganizer && !isValidated && (
        <div className="validated-message" style={{ background: 'var(--silk)', color: 'var(--text-light)' }}>
          Seul l'organisateur peut modifier les questions
        </div>
      )}
    </div>
  );
};

export default Step1Questions;