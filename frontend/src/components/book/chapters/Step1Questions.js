import React, { useEffect, useState } from 'react';
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
  const [showPromptPayload, setShowPromptPayload] = useState(false);
  const [localQuestions, setLocalQuestions] = useState(chapter?.questions_ia || []);

  const isValidated = chapter?.questions_validated || false;
  const isOrganizer = Boolean(user && book && user.id === book.owner_id);
  const isSoloMode = Boolean(book?.cover_config?.soloMode);
  const chapterLocked = chapter?.isChapterClosed || false;
  const questionsPromptPayload = {
    chapterTitle: chapter?.title || '',
    bookTitle: book?.title || '',
    eventType: book?.event_type || 'default',
    style: book?.style_narratif || 'factuel',
    recipientName: book?.recipient_name || '',
    recipientAge: book?.recipient_age || '',
    recipientGender: book?.recipient_gender || ''
  };

  useEffect(() => {
    setLocalQuestions(chapter?.questions_ia || []);
  }, [chapter?.questions_ia]);

  useEffect(() => {
    if (!chapterLocked) {
      return;
    }

    setIsEditing(false);
    setEditingQuestions(null);
    setNewQuestion('');
    setShowPromptPayload(false);
  }, [chapterLocked]);

  const generateAIQuestions = async () => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    try {
      setGenerating(true);
      setError('');

      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Non connecte');
      }

      const response = await fetch('http://localhost:5000/api/ai/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(questionsPromptPayload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Erreur ${response.status}: ${text}`);
      }

      const data = await response.json();

      if (!data.questions) {
        throw new Error('Reponse invalide');
      }

      if (onUpdateChapter) {
        await onUpdateChapter(chapter.id, {
          questions_ia: data.questions
        });
        setLocalQuestions(data.questions);
      }
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleEdit = () => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    setEditingQuestions({
      id: chapter.id,
      questions: localQuestions
    });
    setIsEditing(true);
  };

  const handleSaveQuestions = async () => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    if (!editingQuestions) {
      return;
    }

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
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = () => {
    if (chapterLocked) {
      return;
    }

    if (!newQuestion.trim() || !editingQuestions) {
      return;
    }

    setEditingQuestions({
      ...editingQuestions,
      questions: [...editingQuestions.questions, newQuestion.trim()]
    });
    setNewQuestion('');
  };

  const handleRemoveQuestion = (index) => {
    if (chapterLocked) {
      return;
    }

    if (!editingQuestions) {
      return;
    }

    setEditingQuestions({
      ...editingQuestions,
      questions: editingQuestions.questions.filter((_, currentIndex) => currentIndex !== index)
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditingQuestions(null);
    setNewQuestion('');
  };

  const handleValidate = async () => {
    if (chapterLocked) {
      setError('Ce chapitre est verrouille apres validation finale.');
      return;
    }

    try {
      setError('');
      await onUpdateChapter(chapter.id, { questions_validated: true });
    } catch (validationError) {
      setError(validationError.message);
    }
  };

  if (isEditing && editingQuestions) {
    return (
      <div className="workflow-content">
        <div className="card" style={{ padding: 'var(--space-xl)' }}>
          <h3 style={{ margin: '0 0 var(--space-lg)', fontSize: '18px', fontWeight: '600' }}>
            Modifier les questions
          </h3>

          {error && (
            <div style={{ color: '#dc3545', marginBottom: '15px' }}>{error}</div>
          )}

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <span className="label-gold">Questions actuelles</span>
            <div style={{ marginTop: 'var(--space-sm)' }}>
              {editingQuestions.questions.map((question, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    marginBottom: 'var(--space-xs)',
                    padding: 'var(--space-sm)',
                    background: 'rgba(255, 255, 255, 0.72)',
                    borderRadius: 'var(--radius)'
                  }}
                >
                  <span style={{ flex: 1, fontSize: '14px' }}>{question}</span>
                  <button
                    onClick={() => handleRemoveQuestion(index)}
                    className="btn-outline"
                    disabled={chapterLocked || saving}
                    style={{
                      padding: '2px 8px',
                      borderColor: '#dc3545',
                      color: '#dc3545'
                    }}
                  >
                    x
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
                onChange={(event) => setNewQuestion(event.target.value)}
                className="input-luxe"
                placeholder="Nouvelle question"
                disabled={chapterLocked || saving}
              />
              <button
                onClick={handleAddQuestion}
                className="btn btn-primary"
                disabled={chapterLocked || saving}
                style={{ padding: '0 20px', whiteSpace: 'nowrap' }}
              >
                Ajouter
              </button>
            </div>
          </div>

          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              onClick={handleCancel}
              className="modal-btn modal-btn-secondary"
              disabled={saving}
            >
              Annuler
            </button>
            <button
              onClick={handleSaveQuestions}
              className="modal-btn modal-btn-primary"
              disabled={saving}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les questions'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-content">
      <div className={`questions-section ${isValidated ? 'validated' : ''}`}>
        <div className="questions-header">
          <h3>Questions pour vous aider</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Tooltip
              text={
                isSoloMode
                  ? 'Ces questions vous aident a cadrer votre chapitre en mode solo'
                  : "Ces questions vous aident a cadrer le chapitre avant d'inviter les contributeurs"
              }
            >
              <span style={{ color: 'var(--gold)', cursor: 'help' }}>i</span>
            </Tooltip>

            <Tooltip text="Voir les elements envoyes au prompt questions">
              <button
                type="button"
                onClick={() => setShowPromptPayload((previous) => !previous)}
                className="btn-outline"
                style={{
                  padding: '2px 8px',
                  lineHeight: 1.2,
                  minHeight: 'auto',
                  borderColor: 'var(--mist)',
                  color: 'var(--ink)',
                  background: showPromptPayload ? '#f6f3ec' : '#fff'
                }}
                aria-label="Afficher le payload prompt questions"
              >
                (p)
              </button>
            </Tooltip>
          </div>
        </div>

        {showPromptPayload && (
          <div
            className="card"
            style={{
              marginBottom: 'var(--space-md)',
              padding: 'var(--space-md)',
              background: '#f8f7f4',
              borderColor: 'var(--mist)',
              boxShadow: 'none'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-light)',
                marginBottom: '8px'
              }}
            >
              Elements envoyes au prompt
            </div>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: '12px',
                lineHeight: 1.45,
                color: 'var(--ink)'
              }}
            >
              {JSON.stringify(questionsPromptPayload, null, 2)}
            </pre>
          </div>
        )}

        {error && (
          <div style={{ color: '#dc3545', marginBottom: '15px' }}>{error}</div>
        )}

        <ul className="questions-list">
          {localQuestions.length > 0 ? (
            localQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))
          ) : (
            <li style={{ fontStyle: 'italic' }}>Aucune question pour l'instant</li>
          )}
        </ul>

        <p className="questions-info">
          {isValidated
            ? 'Ces questions sont validees et serviront de fil conducteur pour la suite.'
            : (
                isSoloMode
                  ? 'Ces questions vous aident a structurer votre chapitre en mode solo.'
                  : 'Ces questions vous aident a structurer le chapitre avant les invitations.'
              )}
        </p>

        {chapterLocked && (
          <div className="validated-message" style={{ background: 'rgba(255, 255, 255, 0.72)', color: 'var(--text-light)' }}>
            Chapitre verrouille: la validation finale bloque toute modification des etapes.
          </div>
        )}

        {isOrganizer && !isValidated && !chapterLocked && (
          <div className="questions-actions">
            <button
              onClick={generateAIQuestions}
              disabled={generating}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              {generating ? 'Generation...' : 'Regenerer'}
            </button>

            <button
              onClick={handleEdit}
              className="btn btn-outline"
              style={{ flex: 1 }}
            >
              Modifier/Ajouter
            </button>

            <button
              onClick={handleValidate}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              Valider
            </button>
          </div>
        )}

        {!isOrganizer && !isValidated && !chapterLocked && (
          <div className="validated-message" style={{ background: 'rgba(255, 255, 255, 0.72)', color: 'var(--text-light)' }}>
            Seul l'organisateur peut modifier les questions
          </div>
        )}
      </div>
    </div>
  );
};

export default Step1Questions;
